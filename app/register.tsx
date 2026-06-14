import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

export default function RegisterScreen() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();

    // Validation
    if (!trimmedUsername) {
      Alert.alert('Validation Error', 'Please enter a username.');
      return;
    }
    if (trimmedUsername.length < 2) {
      Alert.alert('Validation Error', 'Username must be at least 2 characters.');
      return;
    }
    if (!trimmedEmail) {
      Alert.alert('Validation Error', 'Please enter your email address.');
      return;
    }
    if (!password) {
      Alert.alert('Validation Error', 'Please enter a password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Validation Error', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: password,
      options: {
        data: { username: trimmedUsername },
      },
    });

    if (error) {
      Alert.alert('Registration Error', error.message);
      setLoading(false);
      return;
    }

    // If the session is returned immediately (auto-confirm enabled)
    // the onAuthStateChange in AuthContext will handle the redirect.
    // If email confirmation is required, guide the user.
    if (!data.session) {
      Alert.alert(
        'Check Your Email',
        'We sent you a confirmation link. Please check your email and log in after confirming.',
        [{ text: 'OK', onPress: () => router.replace('/login') }]
      );
    } else {
      // Auto-confirmed — profile was created by trigger; username is set via metadata
      router.replace('/(tabs)/groups');
    }
    setLoading(false);
  }

  const navigateToLogin = () => {
    router.replace('/login');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', padding: 32 }}
    >
      <Text
        style={{
          color: Colors.text,
          fontSize: 36,
          fontWeight: '200',
          textAlign: 'center',
          marginBottom: 8,
          letterSpacing: 1,
        }}
      >
        Harmony
      </Text>
      <Text
        style={{
          color: Colors.textMuted,
          textAlign: 'center',
          marginBottom: 32,
          fontWeight: '300',
          fontSize: 16,
        }}
      >
        Begin your journey
      </Text>

      <View style={[styles.card, { backgroundColor: Colors.surface }]}>
        <TextInput
          style={[styles.input, { color: Colors.text }]}
          placeholder="Username"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={[styles.input, { color: Colors.text }]}
          placeholder="Email"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={[styles.input, { color: Colors.text }]}
          placeholder="Password"
          placeholderTextColor={Colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={[styles.input, { color: Colors.text }]}
          placeholder="Confirm Password"
          placeholderTextColor={Colors.textMuted}
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        {loading ? (
          <ActivityIndicator size="large" color={Colors.sage} style={{ marginVertical: 20 }} />
        ) : (
          <>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: Colors.sage, marginBottom: 16 }]}
              onPress={handleRegister}
              activeOpacity={0.8}
            >
              <Text style={{ color: Colors.surface, textAlign: 'center', fontWeight: '500', fontSize: 18 }}>
                Create Account
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.buttonOutline, { borderColor: Colors.sage }]}
              onPress={navigateToLogin}
              activeOpacity={0.8}
            >
              <Text style={{ color: Colors.sage, textAlign: 'center', fontWeight: '500', fontSize: 18 }}>
                Back to Sign In
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
