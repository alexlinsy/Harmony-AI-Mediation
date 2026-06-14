import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function signInWithEmail() {
    if (!email || !password) {
      Alert.alert('Validation Error', 'Please enter both email and password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) Alert.alert('Error', error.message);
    setLoading(false);
  }

  const navigateToRegister = () => {
    router.replace('/register');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', padding: 32 }}
    >
      <Text style={{ color: Colors.text, fontSize: 36, fontWeight: '200', textAlign: 'center', marginBottom: 8, letterSpacing: 1 }}>
        Harmony
      </Text>
      <Text style={{ color: Colors.textMuted, textAlign: 'center', marginBottom: 48, fontWeight: '300', fontSize: 16 }}>
        Breathe. Connect. Resolve.
      </Text>

      <View style={[styles.card, { backgroundColor: Colors.surface }]}>
        <TextInput
          style={[styles.input, { color: Colors.text }]}
          placeholder="Email"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize={'none'}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={[styles.input, { color: Colors.text }]}
          placeholder="Password"
          placeholderTextColor={Colors.textMuted}
          secureTextEntry={true}
          value={password}
          onChangeText={setPassword}
        />

        {loading ? (
          <ActivityIndicator size="large" color={Colors.sage} style={{ marginVertical: 20 }} />
        ) : (
          <>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: Colors.sage, marginBottom: 16 }]}
              onPress={signInWithEmail}
              activeOpacity={0.8}
            >
              <Text style={{ color: Colors.surface, textAlign: 'center', fontWeight: '500', fontSize: 18 }}>
                Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={navigateToRegister}
              activeOpacity={0.8}
              style={{ marginTop: 8 }}
            >
              <Text style={{ color: Colors.textMuted, textAlign: 'center', fontWeight: '300', fontSize: 15 }}>
                Don&apos;t have an account?{' '}
                <Text style={{ color: Colors.sage, fontWeight: '500' }}>Register</Text>
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 32,
    borderRadius: 32,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 40,
    elevation: 5,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 24,
    padding: 20,
    fontSize: 16,
    marginBottom: 16,
    fontWeight: '300',
  },
  button: {
    paddingVertical: 18,
    borderRadius: 32,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 3,
  },
  buttonOutline: {
    paddingVertical: 18,
    borderRadius: 32,
    borderWidth: 1,
  },
});
