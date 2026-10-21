// GitHub-style calendar heatmap for daily scores (last N weeks).

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Txt from '../Txt';
import { colors, radius, spacing, themed, withAlpha } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export interface HeatmapDay {
  date: string; // yyyy-mm-dd
  value: number; // 0-100
}

const CELL = 15;
const GAP = 3;
const WEEKS = 12;

function intensity(value: number): string {
  if (value <= 0) return colors.paperAlt;
  if (value < 25) return withAlpha(colors.accent, 0.25);
  if (value < 50) return withAlpha(colors.accent, 0.45);
  if (value < 75) return withAlpha(colors.accent, 0.7);
  return colors.accent;
}

export function Heatmap({
  days,
  weeks = WEEKS,
  emptyLabel = 'No activity yet',
}: {
  days: HeatmapDay[];
  weeks?: number;
  emptyLabel?: string;
}) {
  useTheme();
  const [selected, setSelected] = useState<HeatmapDay | null>(null);

  const columns = useMemo(() => {
    const map = new Map(days.map((d) => [d.date, d.value]));
    const today = new Date();
    // End of this week (Saturday)
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const cells: (HeatmapDay | null)[][] = [];
    for (let w = weeks - 1; w >= 0; w -= 1) {
      const col: (HeatmapDay | null)[] = [];
      for (let d = 0; d < 7; d += 1) {
        const date = new Date(end);
        date.setDate(date.getDate() - (w * 7 + (6 - d)));
        if (date > today) {
          col.push(null);
        } else {
          const key = date.toISOString().slice(0, 10);
          col.push({ date: key, value: map.get(key) ?? 0 });
        }
      }
      cells.push(col);
    }
    return cells;
  }, [days, weeks]);

  const hasAny = days.some((d) => d.value > 0);

  if (!hasAny) {
    return (
      <View style={styles.empty}>
        <Txt variant="caption" color={colors.inkFaint}>
          {emptyLabel}
        </Txt>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.grid}>
        {columns.map((col, ci) => (
          <View key={ci} style={styles.column}>
            {col.map((day, di) =>
              day ? (
                <Pressable
                  key={day.date}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.date}: score ${day.value}`}
                  onPress={() => setSelected(day)}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: intensity(day.value),
                      borderColor:
                        selected?.date === day.date ? colors.ink : 'transparent',
                    },
                  ]}
                />
              ) : (
                <View key={`empty-${ci}-${di}`} style={[styles.cell, styles.cellEmpty]} />
              ),
            )}
          </View>
        ))}
      </View>
      <View style={styles.legendRow}>
        <Txt variant="caption" color={colors.inkFaint}>
          {selected ? `${selected.date}: ${selected.value}` : 'Less'}
        </Txt>
        <View style={styles.legendCells}>
          {[0, 25, 50, 75, 100].map((v) => (
            <View key={v} style={[styles.legendCell, { backgroundColor: intensity(v) }]} />
          ))}
        </View>
        <Txt variant="caption" color={colors.inkFaint}>
          More
        </Txt>
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    grid: {
      flexDirection: 'row',
      justifyContent: 'center',
    },
    column: {
      marginRight: GAP,
    },
    cell: {
      width: CELL,
      height: CELL,
      borderRadius: 3,
      marginBottom: GAP,
      borderWidth: 1,
    },
    cellEmpty: {
      backgroundColor: 'transparent',
    },
    empty: {
      height: 60,
      alignItems: 'center',
      justifyContent: 'center',
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginTop: spacing.sm,
    },
    legendCells: {
      flexDirection: 'row',
      marginHorizontal: spacing.xs,
    },
    legendCell: {
      width: 10,
      height: 10,
      borderRadius: 2,
      marginLeft: 2,
    },
  }),
);

export default Heatmap;
