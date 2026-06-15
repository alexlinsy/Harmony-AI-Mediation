import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import {
  fetchConflictPatterns,
  fetchHarmonyIndex,
  fetchTriggerAnalysis,
  type DayCount,
  type HarmonyMonth,
  type TriggerTopic,
} from '@/lib/insights';
import { supabase } from '@/lib/supabase';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const CARD_WIDTH = Dimensions.get('window').width - 48; // 24px padding each side
const BAR_COLORS = [Colors.sage, Colors.sand, Colors.indigo];

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton({ bars = 4 }: { bars?: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={{ gap: 16 }}>
      {Array.from({ length: bars }, (_, i) => (
        <Animated.View
          key={i}
          style={[
            {
              height: 14,
              borderRadius: 7,
              backgroundColor: Colors.sand,
              width: `${50 + (i * 10)}%`,
            },
            animatedStyle,
          ]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Animated dot for harmony wave chart (isolated component to avoid hooks-in-loop)
// ---------------------------------------------------------------------------

function AnimatedDot({
  left,
  top,
  color,
  delay,
}: {
  left: number;
  top: number;
  color: string;
  delay: number;
}) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) })
    );
    scale.value = withDelay(
      delay,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.back(1.5)) })
    );
  }, [delay, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        { left, top, backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Triggers analysis card
// ---------------------------------------------------------------------------

function TriggersCard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TriggerTopic[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const result = await fetchTriggerAnalysis(user.id);
        setData(result);
      } catch (err) {
        console.error('Error fetching trigger analysis:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('explore.triggersTitle')}</Text>
      <Text style={styles.cardSubtitle}>{t('explore.triggersSubtitle')}</Text>
      {loading ? (
        <LoadingSkeleton bars={4} />
      ) : data.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconSymbol name="exclamationmark.triangle" size={36} color={Colors.textMuted} style={styles.emptyIcon} />
          <Text style={styles.emptyText}>{t('explore.noDataTriggers')}</Text>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          {data.map((item, index) => (
            <View key={item.topic} style={styles.triggerRow}>
              <Text style={styles.triggerLabel} numberOfLines={1}>
                {item.topic}
              </Text>
              <View style={styles.triggerBarTrack}>
                <View
                  style={[
                    styles.triggerBarFill,
                    {
                      width: `${item.percentage}%`,
                      backgroundColor: BAR_COLORS[index % BAR_COLORS.length],
                    },
                  ]}
                />
              </View>
              <Text style={styles.triggerPercent}>{Math.round(item.percentage)}%</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Conflict patterns card
// ---------------------------------------------------------------------------

function PatternsCard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DayCount[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const result = await fetchConflictPatterns(user.id);
        setData(result);
      } catch (err) {
        console.error('Error fetching conflict patterns:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

  // Build a full 7-day array, mapping day index (0=Sun..6=Sat) to count
  const fullData: number[] = dayKeys.map((_, idx) => {
    const match = data.find((d) => d.day === idx);
    return match ? match.count : 0;
  });

  const maxCount = Math.max(...fullData, 1);
  const barHeight = 100;

  const hasRealData = data.some((d) => d.count > 0);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('explore.patternsTitle')}</Text>
      <Text style={styles.cardSubtitle}>{t('explore.patternsSubtitle')}</Text>
      {loading ? (
        <LoadingSkeleton bars={7} />
      ) : !hasRealData ? (
        <View style={styles.emptyContainer}>
          <IconSymbol name="calendar" size={36} color={Colors.textMuted} style={styles.emptyIcon} />
          <Text style={styles.emptyText}>{t('explore.noDataPatterns')}</Text>
        </View>
      ) : (
        <View>
          <View style={styles.patternChartRow}>
            {fullData.map((count, idx) => {
              const isMax = count === maxCount && maxCount > 0;
              const heightFraction = (count / maxCount) * barHeight;

              return (
                <View key={dayKeys[idx]} style={styles.patternBarColumn}>
                  <Text style={styles.patternCountText}>{count}</Text>
                  <View
                    style={[
                      styles.patternBar,
                      {
                        height: Math.max(heightFraction, count > 0 ? 4 : 0),
                        backgroundColor: isMax ? Colors.indigo : Colors.sage,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.patternDayLabel,
                      isMax && { color: Colors.indigo, fontWeight: '600' },
                    ]}
                  >
                    {t(`explore.days.${dayKeys[idx]}`)}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={styles.patternInsightContainer}>
            <IconSymbol name="lightbulb.fill" size={16} color={Colors.indigo} />
            <Text style={styles.patternInsightText}>{t('explore.patternsInsight')}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Harmony index card
// ---------------------------------------------------------------------------

function HarmonyCard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HarmonyMonth[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const result = await fetchHarmonyIndex(user.id);
        setData(result);
      } catch (err) {
        console.error('Error fetching harmony index:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('explore.harmonyTitle')}</Text>
      <Text style={styles.cardSubtitle}>{t('explore.harmonySubtitle')}</Text>
      {loading ? (
        <LoadingSkeleton bars={3} />
      ) : data.length === 0 || data.every((m) => m.total === 0) ? (
        <View style={styles.emptyContainer}>
          <IconSymbol name="circle.hexagongrid.fill" size={36} color={Colors.textMuted} style={styles.emptyIcon} />
          <Text style={styles.emptyText}>{t('explore.noData')}</Text>
        </View>
      ) : (
        <HarmonyWaveChart data={data} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Harmony wave chart (no react-native-svg — uses positioned Views and Animated dots)
// ---------------------------------------------------------------------------

function HarmonyWaveChart({ data }: { data: HarmonyMonth[] }) {
  const { t } = useLanguage();
  const points = data.slice(-6);

  if (points.length === 0) return null;

  const chartWidth = CARD_WIDTH - 48 - 32; // card padding + extra margin
  const chartHeight = 90;
  const paddingLeft = 10;
  const paddingRight = 10;
  const paddingTop = 8;
  const paddingBottom = 24;

  const drawWidth = chartWidth - paddingLeft - paddingRight;
  const drawHeight = chartHeight - paddingTop - paddingBottom;

  const maxY = Math.max(...points.map((p) => p.peacePoints), 1);
  const yScale = drawHeight / maxY;

  const stepX = points.length > 1 ? drawWidth / (points.length - 1) : drawWidth / 2;
  const xPositions = points.map((_, i) => paddingLeft + i * stepX);
  const yPositions = points.map((p) => paddingTop + drawHeight - p.peacePoints * yScale);

  return (
    <View>
      {/* Chart area — absolute-positioned dots & lines are compact */}
      <View style={{ height: chartHeight }}>
        {/* Connection segments between dots */}
        {points.length > 1 &&
          points.slice(0, -1).map((_, idx) => {
            const x1 = xPositions[idx];
            const y1 = yPositions[idx];
            const x2 = xPositions[idx + 1];
            const y2 = yPositions[idx + 1];
            const dx = x2 - x1;
            const dy = y2 - y1;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            return (
              <View
                key={`seg-${idx}`}
                style={{
                  position: 'absolute',
                  width: distance,
                  height: 2,
                  backgroundColor: Colors.sage,
                  borderRadius: 1,
                  left: midX - distance / 2,
                  top: midY - 1,
                  transform: [{ rotate: `${angle}deg` }],
                }}
              />
            );
          })}

        {/* Data dots with staggered entrance animation */}
        {points.map((p, idx) => (
          <AnimatedDot
            key={p.month}
            left={xPositions[idx] - 6}
            top={yPositions[idx] - 6}
            color={p.peacePoints >= maxY * 0.6 ? Colors.indigo : Colors.sage}
            delay={idx * 200}
          />
        ))}

        {/* X-axis labels */}
        {points.map((p, idx) => {
          const label = p.month.length >= 7 ? p.month.slice(5, 7) + '/' + p.month.slice(2, 4) : p.month;
          return (
            <Text
              key={p.month}
              style={{
                position: 'absolute',
                fontSize: 10,
                fontWeight: '300',
                color: Colors.textMuted,
                width: 32,
                textAlign: 'center',
                bottom: 2,
                left: xPositions[idx] - 16,
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
          );
        })}
      </View>

      {/* Summary — sits below the chart in the flow, not cramped inside */}
      {points.length >= 2 && (() => {
        const firstRate = points[0].rate;
        const lastRate = points[points.length - 1].rate;
        const percent = firstRate > 0
          ? Math.round(((lastRate - firstRate) / firstRate) * 100)
          : lastRate > 0
            ? Math.round(lastRate * 100)
            : 0;
        return (
          <View style={styles.harmonySummaryContainer}>
            <IconSymbol name="arrow.up.heart" size={16} color={Colors.sage} />
            <Text style={styles.harmonySummaryText}>{t('explore.harmonyGrowth', { percent: String(percent) })}</Text>
          </View>
        );
      })()}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function InsightsScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [totalSessions, setTotalSessions] = useState(0);

  useEffect(() => {
    if (user) {
      fetchInsights();
    }
  }, [user]);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const { data: userGroups } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user?.id);

      const groupIds = userGroups?.map(g => g.group_id) || [];

      if (groupIds.length > 0) {
        const { data: sessions } = await supabase
          .from('mediation_sessions')
          .select('category')
          .in('group_id', groupIds)
          .in('status', ['completed', 'resolved']);

        const counts: Record<string, number> = {
          Household: 0,
          Financial: 0,
          Emotional: 0,
          Communication: 0,
          Other: 0,
        };

        let total = 0;
        sessions?.forEach(session => {
          if (session.category && counts[session.category] !== undefined) {
            counts[session.category]++;
          } else {
            counts['Other']++;
          }
          total++;
        });

        setCategoryCounts(counts);
        setTotalSessions(total);
      }
    } catch (error) {
      console.error('Error fetching insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { key: 'Emotional', icon: 'heart.fill', color: '#FFB3B3' },
    { key: 'Communication', icon: 'bubble.left.and.bubble.right.fill', color: '#B3D4FF' },
    { key: 'Household', icon: 'house.fill', color: Colors.sage },
    { key: 'Financial', icon: 'dollarsign.circle.fill', color: '#FFE4B3' },
    { key: 'Other', icon: 'ellipsis.circle.fill', color: Colors.textMuted },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, paddingBottom: 120 }}>
        <Text style={styles.headerTitle}>{t('explore.title')}</Text>
        <Text style={styles.subtitle}>{t('explore.subtitle')}</Text>

        {/* Existing category bar chart */}
        {loading ? (
          <ActivityIndicator size="large" color={Colors.sage} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.chartContainer}>
            {totalSessions === 0 ? (
              <View style={{ paddingVertical: 20 }}>
                <IconSymbol name="chart.bar" size={48} color={Colors.textMuted} style={{ alignSelf: 'center', marginBottom: 16 }} />
                <Text style={styles.noDataText}>{t('explore.noData')}</Text>
              </View>
            ) : (
              categories.map(cat => {
                const count = categoryCounts[cat.key] || 0;
                const percentage = totalSessions > 0 ? (count / totalSessions) * 100 : 0;

                return (
                  <View key={cat.key} style={styles.barRow}>
                    <View style={styles.labelContainer}>
                      <IconSymbol name={cat.icon as 'heart.fill'} size={20} color={cat.color} />
                      <Text style={styles.labelText}>{t(`explore.category.${cat.key}`)}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${percentage}%`, backgroundColor: cat.color }]} />
                    </View>
                    <Text style={styles.countText}>{count}</Text>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* New analysis card sections */}
        <View style={{ marginTop: 24, gap: 24 }}>
          <TriggersCard />
          <PatternsCard />
          <HarmonyCard />
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// StyleSheet
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  headerTitle: {
    fontSize: 32,
    fontWeight: '300',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textMuted,
    fontWeight: '300',
    marginBottom: 32,
  },
  chartContainer: {
    backgroundColor: Colors.surface,
    padding: 24,
    borderRadius: 32,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
  },
  noDataText: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontWeight: '300',
    lineHeight: 24,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 130,
  },
  labelText: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.text,
    marginLeft: 8,
  },
  barTrack: {
    flex: 1,
    height: 12,
    backgroundColor: Colors.background,
    borderRadius: 6,
    overflow: 'hidden',
    marginHorizontal: 12,
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    width: 24,
    textAlign: 'right',
  },
  // Card shared styles
  card: {
    backgroundColor: Colors.surface,
    padding: 24,
    borderRadius: 32,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '400',
    color: Colors.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '300',
    color: Colors.textMuted,
    marginBottom: 40,
  },
  // Empty state
  emptyContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyIcon: {
    marginBottom: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontWeight: '300',
    fontSize: 14,
    lineHeight: 22,
  },
  // Triggers card
  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  triggerLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: Colors.text,
    width: 80,
    marginRight: 8,
  },
  triggerBarTrack: {
    flex: 1,
    height: 10,
    backgroundColor: Colors.background,
    borderRadius: 5,
    overflow: 'hidden',
    marginRight: 8,
  },
  triggerBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  triggerPercent: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text,
    width: 38,
    textAlign: 'right',
  },
  // Patterns card
  patternChartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingBottom: 24,
  },
  patternBarColumn: {
    alignItems: 'center',
    flex: 1,
    height: 140,
    justifyContent: 'flex-end',
  },
  patternBar: {
    width: 16,
    borderRadius: 8,
    minHeight: 0,
  },
  patternCountText: {
    fontSize: 11,
    fontWeight: '400',
    color: Colors.textMuted,
    marginBottom: 4,
  },
  patternDayLabel: {
    fontSize: 11,
    fontWeight: '400',
    color: Colors.textMuted,
    marginTop: 6,
  },
  patternInsightContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.background,
    gap: 8,
  },
  patternInsightText: {
    fontSize: 13,
    fontWeight: '300',
    color: Colors.textMuted,
    lineHeight: 20,
    flex: 1,
  },
  // Harmony wave chart
  dot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  harmonySummaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  harmonySummaryText: {
    fontSize: 13,
    fontWeight: '300',
    color: Colors.textMuted,
    lineHeight: 20,
    flex: 1,
  },
});
