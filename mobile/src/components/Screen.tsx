import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  contentStyle?: ViewStyle;
  keyboardAvoiding?: boolean;
  refreshControl?: React.ReactElement;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  contentStyle,
  keyboardAvoiding = false,
  refreshControl,
}: ScreenProps) {
  const theme = useTheme();
  // Content stays readable on wide screens (web, tablets, landscape):
  // centered column capped at 720 logical pixels.
  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.grow,
        styles.centerColumn,
        padded ? styles.padded : null,
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.flex,
        styles.centerColumn,
        padded ? styles.padded : null,
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar
        barStyle={theme.dark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.paper}
      />
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.paper,
    },
    flex: {
      flex: 1,
    },
    grow: {
      flexGrow: 1,
    },
    centerColumn: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
    },
    padded: {
      paddingHorizontal: 24,
    },
  }),
);

export default Screen;
