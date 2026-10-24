import { mergeTranscript, voiceErrorFor } from '../voiceInput';

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
