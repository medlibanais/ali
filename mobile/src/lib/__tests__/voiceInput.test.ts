import { mergeTranscript, pickVoiceLang, voiceErrorFor } from '../voiceInput';

describe('mergeTranscript', () => {
  it('uses the transcript alone when nothing was typed', () => {
    expect(mergeTranscript('', 'what should I do next', 500)).toBe('what should I do next');
  });

  it('adds dictation after typed text with one space', () => {
    expect(mergeTranscript('Hey coach ', ' am I on track', 500)).toBe('Hey coach am I on track');
  });

  it('never goes past the 500-character limit', () => {
    const merged = mergeTranscript('a'.repeat(495), 'hello world', 500);
    expect(merged).toHaveLength(500);
  });

  it('keeps the typed text when the transcript is empty', () => {
    expect(mergeTranscript('typed', '  ', 500)).toBe('typed');
  });
});

describe('voiceErrorFor', () => {
  it('stays quiet when the user cancels or says nothing', () => {
    expect(voiceErrorFor('aborted')).toBeNull();
    expect(voiceErrorFor('no-speech')).toBeNull();
  });

  it('explains permission and offline failures', () => {
    expect(voiceErrorFor('not-allowed')).toBe('permission');
    expect(voiceErrorFor('network')).toBe('offline');
    expect(voiceErrorFor('language-not-supported')).toBe('unavailable');
    expect(voiceErrorFor('audio-capture')).toBe('failed');
  });
});

describe('pickVoiceLang', () => {
  it("uses the phone's language when the recognizer has it", () => {
    expect(pickVoiceLang('fr-FR', ['en-US', 'fr-FR', 'ar-MA'])).toBe('fr-FR');
    expect(pickVoiceLang('ar-MA', ['en-US', 'ar_MA'])).toBe('ar_MA');
  });

  it('falls back to another variant of the same language', () => {
    expect(pickVoiceLang('fr-MA', ['en-US', 'fr-FR'])).toBe('fr-FR');
  });

  it('falls back to English when the language is missing', () => {
    expect(pickVoiceLang('ber-MA', ['en-US', 'fr-FR'])).toBe('en-US');
  });

  it("tries the phone's language when the list is unknown", () => {
    expect(pickVoiceLang('ar-MA', null)).toBe('ar-MA');
    expect(pickVoiceLang('ar-MA', [])).toBe('ar-MA');
  });
});
