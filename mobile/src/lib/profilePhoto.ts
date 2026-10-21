// Profile photo pipeline: pick -> crop -> compress -> upload -> profile row.
// Photos live in the `profile-photos` bucket under {user_id}/avatar.jpg.

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';
import { supabase } from './supabase';

const BUCKET = 'profile-photos';
const MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5 MB raw input limit
const OUTPUT_SIZE = 512;

export class PhotoError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'permission'
      | 'cancelled'
      | 'too_large'
      | 'upload'
      | 'unknown' = 'unknown',
  ) {
    super(message);
  }
}

async function ensurePermission(
  source: 'camera' | 'gallery',
): Promise<boolean> {
  const current =
    source === 'camera'
      ? await ImagePicker.getCameraPermissionsAsync()
      : await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  return requested.granted;
}

export function openAppSettings(): void {
  Linking.openSettings().catch(() => undefined);
}

/** Decode base64 into a Uint8Array without the `atob` global. */
function base64ToBytes(base64: string): Uint8Array {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Map<string, number>();
  for (let i = 0; i < chars.length; i += 1) lookup.set(chars[i], i);
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of base64.replace(/=+$/, '')) {
    const value = lookup.get(ch);
    if (value === undefined) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/**
 * Pick (camera or gallery), square-crop, resize to 512 px and compress to a
 * JPEG under ~500 KB. Returns base64 so callers can upload it or send it to
 * an Edge Function.
 */
export async function pickSquarePhoto(
  source: 'camera' | 'gallery',
): Promise<string> {
  const granted = await ensurePermission(source);
  if (!granted) {
    throw new PhotoError(
      'Permission denied. Enable access in your device settings to add a photo.',
      'permission',
    );
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.9,
          cameraType: ImagePicker.CameraType.front,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.9,
        });

  if (result.canceled) {
    throw new PhotoError('cancelled', 'cancelled');
  }
  const asset = result.assets[0];
  if (!asset?.uri) throw new PhotoError('No photo selected.', 'unknown');
  if (asset.fileSize && asset.fileSize > MAX_INPUT_BYTES) {
    throw new PhotoError(
      'That photo is larger than 5 MB. Choose a smaller one.',
      'too_large',
    );
  }

  // Crop to center square, resize, compress to JPEG (<500KB target).
  // base64 comes from the manipulator itself so this also works on web,
  // where expo-file-system cannot read files.
  const manipulated = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: OUTPUT_SIZE, height: OUTPUT_SIZE } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  const base64 = manipulated.base64;
  if (!base64) throw new PhotoError('Could not read that photo.', 'unknown');
  // base64 is 4/3 of the byte size.
  if ((base64.length * 3) / 4 > 500 * 1024) {
    // One more squeeze if the first pass overshoots.
    const tighter = await ImageManipulator.manipulateAsync(
      manipulated.uri,
      [],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    return tighter.base64 ?? '';
  }
  return base64;
}

export async function pickAndUploadPhoto(
  source: 'camera' | 'gallery',
): Promise<string> {
  const base64 = await pickSquarePhoto(source);
  return upload(base64ToBytes(base64));
}

async function upload(bytes: Uint8Array): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new PhotoError('Not signed in.', 'upload');

  const path = `${user.id}/avatar.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes.buffer as ArrayBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (error) throw new PhotoError(error.message, 'upload');

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  // Cache-bust so the new photo shows immediately everywhere.
  const url = `${publicUrl}?t=${Date.now()}`;
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ photo_url: url, avatar_mode: 'photo' })
    .eq('id', user.id);
  if (updateError) throw new PhotoError(updateError.message, 'upload');
  return url;
}

export async function removePhoto(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new PhotoError('Not signed in.', 'upload');

  await supabase.storage.from(BUCKET).remove([`${user.id}/avatar.jpg`]);
  const { error } = await supabase
    .from('profiles')
    .update({ photo_url: null, avatar_mode: 'avatar' })
    .eq('id', user.id);
  if (error) throw new PhotoError(error.message, 'upload');
}

export async function setAvatarMode(mode: 'avatar' | 'photo' | 'ai'): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new PhotoError('Not signed in.', 'upload');
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_mode: mode })
    .eq('id', user.id);
  if (error) throw new PhotoError(error.message, 'upload');
}
