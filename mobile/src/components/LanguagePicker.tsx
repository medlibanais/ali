import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_OPTIONS, Language } from '../i18n/languages';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setLanguage } from '../store/slices/languageSlice';
import { colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { CheckGlyph } from './icons';
import Txt from './Txt';

/**
 * Language choice for Settings. Picking one re-renders every screen at once
 * (react-i18next), saves it on the device and in profiles.language.
 */
export function LanguagePicker() {
  useTheme();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const current = useAppSelector((state) => state.language.language);
  const restartNeeded = useAppSelector((state) => state.language.restartNeeded);

  const choose = (code: Language) => {
    if (code !== current) void dispatch(setLanguage({ language: code }));
  };

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('language.title')}>
      {LANGUAGE_OPTIONS.map((option) => {
        const selected = option.code === current;
        // The language's own name, plus its name in the current language
        // so nobody gets stuck in a script they cannot read.
        const translated = t(`language.names.${option.code}`);
        return (
          <Pressable
            key={option.code}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={
              option.nativeName === translated
                ? option.nativeName
                : `${option.nativeName}, ${translated}`
            }
            onPress={() => choose(option.code)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.text}>
              <Txt variant="bodySemi" color={selected ? colors.accent : colors.ink}>
                {option.nativeName}
              </Txt>
              {option.nativeName !== translated ? (
                <Txt variant="caption" color={colors.inkSoft}>
                  {translated}
                </Txt>
              ) : null}
            </View>
            <View style={[styles.radio, selected && styles.radioOn]}>
              {selected ? <CheckGlyph size={12} /> : null}
            </View>
          </Pressable>
        );
      })}
      {restartNeeded && Platform.OS !== 'web' ? (
        <Txt variant="caption" color={colors.inkSoft} style={styles.note}>
          {t('language.restartNote')}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 52,
      paddingVertical: spacing.sm,
      paddingEnd: spacing.md,
    },
    pressed: {
      opacity: 0.7,
    },
    text: {
      flex: 1,
    },
    radio: {
      width: 24,
      height: 24,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.inkFaint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    note: {
      paddingEnd: spacing.md,
      paddingBottom: spacing.sm,
    },
  }),
);

export default LanguagePicker;
