import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Txt from './Txt';
import {
  PASSWORD_RULES,
  passwordStrength,
  STRENGTH_LABEL,
  type PasswordStrength,
} from '../lib/password';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

const SEGMENT_COLORS: Record<Exclude<PasswordStrength, 'empty'>, string> = {
  weak: '#A63D2F',
  fair: '#C2922E',
  good: '#6B7A3A',
  strong: '#1F5138',
};

function segmentCount(strength: PasswordStrength): number {
  switch (strength) {
    case 'weak': return 1;
    case 'fair': return 2;
    case 'good': return 3;
    case 'strong': return 4;
    default: return 0;
  }
}

export function PasswordStrengthMeter({
  password,
  showRules = true,
}: {
  password: string;
  showRules?: boolean;
}) {
  useTheme();
  const strength = passwordStrength(password);
  const filled = segmentCount(strength);
  const rules = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ rule, met: rule.test(password) })),
    [password],
  );

  if (password.length === 0) return null;

  const activeColor =
    strength === 'empty' ? colors.line : SEGMENT_COLORS[strength];

  return (
    <View
      style={styles.wrap}
      accessibilityLabel={`Password strength: ${STRENGTH_LABEL[strength]}`}
    >
      <View style={styles.meterRow}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { backgroundColor: i < filled ? activeColor : colors.line },
            ]}
          />
        ))}
        <Txt variant="caption" color={colors.inkSoft} style={styles.label}>
          {STRENGTH_LABEL[strength]}
        </Txt>
      </View>
      {showRules ? (
        <View style={styles.rules}>
          {rules.map(({ rule, met }) => (
            <View key={rule.id} style={styles.ruleRow}>
              <View
                style={[
                  styles.ruleSquare,
                  met && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
              />
              <Txt variant="caption" color={met ? colors.inkSoft : colors.inkFaint}>
                {rule.label}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: { marginBottom: spacing.lg },
    meterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    segment: {
      flex: 1,
      height: 4,
      borderRadius: radius.sm,
      marginRight: spacing.xs,
    },
    label: { marginLeft: spacing.sm, width: 48 },
    rules: { marginTop: spacing.xs },
    ruleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs,
      minHeight: 24,
    },
    ruleSquare: {
      width: 10,
      height: 10,
      borderWidth: borderWidth.hairline,
      borderColor: colors.inkFaint,
      borderRadius: radius.xs,
      marginRight: spacing.sm,
      backgroundColor: 'transparent',
    },
  }),
);

export default PasswordStrengthMeter;
