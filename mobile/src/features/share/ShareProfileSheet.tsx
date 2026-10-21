// ShareProfileSheet: a profile card (full-body avatar, name, username and a
// QR code that adds you as a friend) with a row of ways to share it.
// Copy, WhatsApp and More send the invite link; Instagram and Stories send
// a picture of the card through the system share sheet.

import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import AvatarView from '../../avatar/AvatarView';
import { VALID_OPTION_IDS } from '../../avatar/options';
import { bgStyle } from '../../avatar/palettes';
import { sanitizeAvatarConfig } from '../../avatar/types';
import {
  CameraGlyph,
  ChatPhoneGlyph,
  CloseGlyph,
  LinkGlyph,
  MoreGlyph,
  StoryGlyph,
  type IconProps,
} from '../../components/icons';
import { PressableScale } from '../../components/Motion';
import ProfileAvatar from '../../components/ProfileAvatar';
import QrCode from '../../components/QrCode';
import Txt from '../../components/Txt';
import { titleForLevel } from '../../lib/levels';
import { useAppSelector } from '../../store/hooks';
import { colors, mix, radius, softShadow, spacing, themed } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { inviteLink, inviteMessage } from '../friends/logic';

const NO_CODE = 'Your invite code is still being set up. Try again in a moment.';

interface Target {
  key: string;
  label: string;
  Icon: (props: IconProps) => React.ReactElement;
  background: string;
  iconColor: string;
  run: () => void | Promise<void>;
}

export function ShareProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  useTheme();
  // Messages show inside the sheet: app-wide toasts sit under the modal.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [notice]);
  const profile = useAppSelector((state) => state.user.profile);
  const level = useAppSelector((state) => state.gamification.level);
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { width: winW } = useWindowDimensions();

  const code = profile?.invite_code ?? null;
  const config = sanitizeAvatarConfig(profile?.avatar_config, VALID_OPTION_IDS);
  const bg = bgStyle(config.bg);
  const usesImage =
    (profile?.avatar_mode === 'ai' && !!profile.ai_avatar_url) ||
    (profile?.avatar_mode === 'photo' && !!(profile.photo_url ?? profile.avatar_url));

  const cardW = Math.min(winW - spacing.xl * 2, 340);
  const stageH = Math.round(cardW * 1.08);
  const qrSize = Math.round(cardW * 0.25);

  const shareImage = async (key: string, dialogTitle: string) => {
    if (!cardRef.current) return;
    if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
      setNotice('Sharing a picture works in the phone app, not in the browser.');
      return;
    }
    setBusy(key);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, width: 1080, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle });
    } catch {
      setNotice('Could not create the picture. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    if (!code) {
      setNotice(NO_CODE);
      return;
    }
    await Clipboard.setStringAsync(inviteLink(code));
    setNotice('Invite link copied.');
  };

  const whatsApp = async () => {
    if (!code) {
      setNotice(NO_CODE);
      return;
    }
    const text = encodeURIComponent(inviteMessage(code));
    try {
      if (Platform.OS === 'web') throw new Error('web');
      await Linking.openURL(`whatsapp://send?text=${text}`);
    } catch {
      // No WhatsApp app (or the web build): WhatsApp's web link still works.
      await Linking.openURL(`https://wa.me/?text=${text}`).catch(() =>
        setNotice('WhatsApp is not available on this device.'),
      );
    }
  };

  const more = async () => {
    if (!code) {
      setNotice(NO_CODE);
      return;
    }
    try {
      await Share.share({ message: inviteMessage(code) });
    } catch {
      setNotice('Sharing is not available on this device.');
    }
  };

  const targets: Target[] = [
    { key: 'copy', label: 'Copy link', Icon: LinkGlyph, background: colors.paperAlt, iconColor: colors.ink, run: copyLink },
    { key: 'whatsapp', label: 'WhatsApp', Icon: ChatPhoneGlyph, background: '#25D366', iconColor: '#FFFFFF', run: whatsApp },
    {
      key: 'instagram',
      label: 'Instagram',
      Icon: CameraGlyph,
      background: '#D6336C',
      iconColor: '#FFFFFF',
      run: () => shareImage('instagram', 'Share to Instagram'),
    },
    {
      key: 'stories',
      label: 'Stories',
      Icon: StoryGlyph,
      background: '#7B4BC4',
      iconColor: '#FFFFFF',
      run: () => shareImage('stories', 'Share to your story'),
    },
    { key: 'more', label: 'More', Icon: MoreGlyph, background: colors.paperAlt, iconColor: colors.ink, run: more },
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={8}
            style={styles.close}
          >
            <CloseGlyph />
          </PressableScale>
          <Txt variant="heading">Share profile</Txt>
          <View style={styles.close} />
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/* The card is captured as a picture, so it carries its own background. */}
          <View ref={cardRef} collapsable={false} style={[styles.card, { width: cardW }]}>
            <View style={{ height: stageH }}>
              <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 10 10" preserveAspectRatio="none">
                <Defs>
                  <LinearGradient id={`cardBg${config.bg}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={mix(bg.from, '#FFFFFF', 0.35)} />
                    <Stop offset="1" stopColor={bg.to} />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={10} height={10} fill={`url(#cardBg${config.bg})`} />
              </Svg>
              <View style={styles.stage}>
                {usesImage ? (
                  <View style={styles.photoWrap}>
                    <ProfileAvatar profile={profile} size={cardW * 0.62} animated={false} />
                  </View>
                ) : (
                  <AvatarView config={config} size={stageH * 1.02} mood="happy" mode="full-body" bare animated={false} />
                )}
              </View>
              <View style={styles.brand}>
                <Txt variant="label" color={colors.ink} style={styles.brandText}>
                  GROW
                </Txt>
              </View>
            </View>
            <View style={styles.cardFooter}>
              <View style={styles.identity}>
                <Txt variant="title" numberOfLines={1} color="#2A2622" style={styles.name}>
                  {profile?.first_name ?? 'Me'}
                </Txt>
                {profile?.username ? (
                  <Txt variant="caption" numberOfLines={1} color="#6E655C">
                    {`@${profile.username}`}
                  </Txt>
                ) : null}
                <Txt variant="caption" numberOfLines={2} color="#9A9086" style={styles.addMe}>
                  {`Level ${level} · ${titleForLevel(level)}\nScan to add me on GROW`}
                </Txt>
              </View>
              <View style={[styles.qrTile, { width: qrSize + 12, height: qrSize + 12 }]}>
                {code ? (
                  <QrCode value={inviteLink(code)} size={qrSize} color="#2A2622" background="#FFF6D6" />
                ) : (
                  <Txt variant="caption" color="#6E655C" align="center">
                    Code soon
                  </Txt>
                )}
              </View>
            </View>
          </View>

          <Txt variant="label" style={styles.shareTitle}>
            Share your profile
          </Txt>
          <View style={styles.targets}>
            {targets.map(({ key, label, Icon, background, iconColor, run }) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={label}
                disabled={busy !== null}
                onPress={() => void run()}
                style={({ pressed }) => [styles.target, (pressed || busy === key) && styles.pressed]}
              >
                <View style={[styles.targetIcon, { backgroundColor: background }]}>
                  <Icon size={24} color={iconColor} />
                </View>
                <Txt variant="caption" color={colors.inkSoft} style={styles.targetLabel} numberOfLines={1}>
                  {label}
                </Txt>
              </Pressable>
            ))}
          </View>
          <Txt
            variant="caption"
            color={notice ? colors.accent : colors.inkFaint}
            align="center"
            style={styles.hint}
            accessibilityLiveRegion="polite"
          >
            {notice ?? 'Friends who scan the code or open your link land on your invite in the app.'}
          </Txt>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.paper,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    close: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xxl,
    },
    card: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
      ...softShadow(3),
    },
    stage: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'flex-end',
      // the canvas leaves room under the feet for the ground shadow
      marginBottom: -6,
    },
    photoWrap: {
      flex: 1,
      justifyContent: 'center',
    },
    brand: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 3,
      borderRadius: radius.pill,
      backgroundColor: 'rgba(255,255,255,0.75)',
    },
    brandText: {
      letterSpacing: 1.5,
      fontSize: 11,
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.lg,
      gap: spacing.md,
    },
    identity: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontSize: 24,
      lineHeight: 30,
    },
    addMe: {
      marginTop: spacing.xs,
      fontSize: 11,
      lineHeight: 15,
    },
    qrTile: {
      borderRadius: radius.sm,
      backgroundColor: '#FFF6D6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    shareTitle: {
      alignSelf: 'flex-start',
      marginTop: spacing.xl,
      marginBottom: spacing.md,
    },
    targets: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
    },
    target: {
      alignItems: 'center',
      width: 62,
    },
    targetIcon: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
    },
    targetLabel: {
      marginTop: spacing.xs + 2,
      fontSize: 11,
    },
    hint: {
      marginTop: spacing.lg,
    },
    pressed: {
      opacity: 0.6,
    },
  }),
);

export default ShareProfileSheet;
