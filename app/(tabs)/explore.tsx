import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';

export default function InsightsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, padding: 32, justifyContent: 'center' }}>
      <Text style={{ color: Colors.text, fontSize: 36, fontWeight: '200', textAlign: 'center', marginBottom: 8, letterSpacing: 1 }}>
        Insights
      </Text>
      <Text style={{ color: Colors.textMuted, textAlign: 'center', marginBottom: 48, fontWeight: '300', fontSize: 16 }}>
        Contradiction Heatmap & Digital Consensus Protocol
      </Text>
      
      <View style={[styles.card, { backgroundColor: Colors.surface, padding: 40, alignItems: 'center' }]}>
        <Text style={{ color: Colors.textMuted, textAlign: 'center', lineHeight: 28, fontWeight: '300' }}>
          The Insights feature will be available once enough mediation data is collected to gently form a heatmap of your interactions.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 32,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 40,
    elevation: 5,
  }
});
