import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence, interpolateColor } from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Audio } from 'expo-av';
import { useLanguage } from '@/lib/LanguageContext';

interface VoiceChatUIProps {
  visible: boolean;
  onClose: () => void;
  onProcessAudio: (uri: string) => void;
}

export default function VoiceChatUI({ visible, onClose, onProcessAudio }: VoiceChatUIProps) {
  const { t } = useLanguage();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const scale1 = useSharedValue(1);
  const scale2 = useSharedValue(1);
  const colorProgress = useSharedValue(0);

  // Stop recording when modal is closed unexpectedly
  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, [recording]);

  useEffect(() => {
    if (isRecording) {
      scale1.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1, true
      );

      scale2.value = withRepeat(
        withTiming(3, { duration: 2000, easing: Easing.out(Easing.ease) }),
        -1, false
      );

      colorProgress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 3000, easing: Easing.linear }),
          withTiming(0, { duration: 3000, easing: Easing.linear })
        ),
        -1, true
      );
    } else {
      scale1.value = withTiming(1);
      scale2.value = 1;
      colorProgress.value = withTiming(0);
    }
  }, [isRecording]);

  const animatedInnerCircle = useAnimatedStyle(() => ({
    transform: [{ scale: scale1.value }],
    backgroundColor: interpolateColor(colorProgress.value, [0, 1], [Colors.sage, Colors.indigo])
  }));

  const animatedOuterCircle = useAnimatedStyle(() => ({
    transform: [{ scale: scale2.value }],
    opacity: isRecording ? 0.3 - (scale2.value - 1) * 0.15 : 0,
    backgroundColor: Colors.sage
  }));

  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status === 'granted') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording: newRecording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        setRecording(newRecording);
        setIsRecording(true);
      }
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  async function stopRecordingAndSend() {
    if (!recording) return;

    const currentRecording = recording;
    setIsRecording(false);
    setRecording(null);

    try {
      await currentRecording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.error('Failed to stop recording (it might already be stopped)', error);
    }

    const uri = currentRecording.getURI();
    if (uri) {
      onProcessAudio(uri);
    }
  }

  const toggleRecording = () => {
    if (isRecording) {
      stopRecordingAndSend();
    } else {
      startRecording();
    }
  };

  const handleClose = () => {
    if (isRecording) {
      recording?.stopAndUnloadAsync().catch(() => {});
      setIsRecording(false);
      setRecording(null);
    }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <IconSymbol name="xmark" size={28} color={Colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.centerContent}>
          <Animated.View style={[styles.outerCircle, animatedOuterCircle]} />
          <TouchableOpacity activeOpacity={0.8} onPress={toggleRecording}>
            <Animated.View style={[styles.innerCircle, animatedInnerCircle]}>
              <IconSymbol name={isRecording ? "stop.fill" : "mic.fill"} size={48} color={Colors.surface} />
            </Animated.View>
          </TouchableOpacity>
        </View>

        <View style={{ alignItems: 'center', marginBottom: 80 }}>
          <Text style={styles.statusText}>
            {isRecording ? t('voiceChat.listening') : t('voiceChat.tapToSpeak')}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'space-between',
    paddingVertical: 60,
  },
  closeButton: {
    alignSelf: 'flex-end',
    marginRight: 32,
    marginTop: 20,
    padding: 8,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outerCircle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  innerCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  statusText: {
    fontSize: 20,
    fontWeight: '300',
    color: Colors.text,
    textAlign: 'center',
  }
});
