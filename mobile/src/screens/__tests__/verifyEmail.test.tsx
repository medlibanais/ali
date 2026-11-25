import React from 'react';
import 'react-native-url-polyfill/auto';
import { Linking, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import Button from '../../components/Button';
import { supabase } from '../../lib/supabase';
import VerifyEmailScreen from '../VerifyEmailScreen';

const mockToast = jest.fn();
const mockDispatch = jest.fn();
jest.mock('../../store/hooks', () => ({ useAppDispatch: () => mockDispatch }));
jest.mock('../../store/slices/authSlice', () => ({
  resendVerification: Object.assign((args: unknown) => args, {
    fulfilled: { match: (action: { type: string }) => action.type === 'resent' },
  }),
}));
jest.mock('../../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));
jest.mock('../../components/Button', () => () => null);
jest.mock('../../components/DrawnCheck', () => () => null);
jest.mock('../../components/Glass', () => 'Glass');
jest.mock('../../components/Screen', () => 'Screen');
jest.mock('../../components/Txt', () => 'Txt');
jest.mock('../../components/icons', () => ({ MailGlyph: () => null }));
jest.mock('../../theme/useTheme', () => ({ useTheme: () => ({}) }));
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { verifyOtp: jest.fn(), exchangeCodeForSession: jest.fn(), setSession: jest.fn() } },
}));
jest.mock('react-i18next', () => {
  const t = (key: string) => key;
  return { ...jest.requireActual('react-i18next'), useTranslation: () => ({ t }) };
});

const verifyOtp = supabase.auth.verifyOtp as jest.Mock;
const setSession = supabase.auth.setSession as jest.Mock;
const email = 'test@example.com';
let renderer: TestRenderer.ReactTestRenderer;
let receiveUrl: (event: { url: string }) => void;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  jest.spyOn(Linking, 'addEventListener').mockImplementation((_type, listener) => {
    receiveUrl = listener;
    return { remove: jest.fn() } as unknown as ReturnType<typeof Linking.addEventListener>;
  });
  verifyOtp.mockResolvedValue({ error: null });
  setSession.mockResolvedValue({ error: null });
});

afterEach(() => {
  act(() => renderer.unmount());
  jest.restoreAllMocks();
});

async function mount(params = { email }) {
  type Props = React.ComponentProps<typeof VerifyEmailScreen>;
  await act(async () => {
    renderer = TestRenderer.create(
      <VerifyEmailScreen
        navigation={{ navigate: jest.fn() } as unknown as Props['navigation']}
        route={{ name: 'VerifyEmail', key: 'test', params }}
      />,
    );
  });
}

const enter = (value: string) => {
  renderer.root.findByType(TextInput).props.onChangeText(value);
};

it('auto-verifies a pasted, localized code and ignores a second submission while pending', async () => {
  await mount();
  let finish!: (value: { error: null }) => void;
  verifyOtp.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));

  await act(async () => { enter('١٢ ۳۴'); });
  expect(verifyOtp).not.toHaveBeenCalled();
  await act(async () => { enter('١٢ ۳۴-۵۶'); });
  expect(verifyOtp).toHaveBeenCalledWith({ email, token: '123456', type: 'email' });

  const submit = renderer.root.findAllByType(Button).find((button) => button.props.testID === 'verify-submit');
  await act(async () => { submit?.props.onPress(); });
  expect(verifyOtp).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ error: null }); });
  expect(mockToast).toHaveBeenCalledWith({ message: 'verifyEmail.emailVerified' });
});

it('keeps a rejected code editable and clears it after a successful resend', async () => {
  await mount();
  verifyOtp.mockResolvedValueOnce({ error: new Error('expired') });
  await act(async () => { enter('123456'); });
  expect(renderer.root.findByType(TextInput).props.editable).toBe(true);
  expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' }).length).toBeGreaterThan(0);

  mockDispatch.mockResolvedValueOnce({ type: 'resent' });
  const resend = renderer.root.findAllByType(Button)
    .find((button) => button.props.title === 'verifyEmail.resendVerificationEmail');
  await act(async () => { await resend?.props.onPress(); });
  expect(mockDispatch).toHaveBeenCalledWith({ email });
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
});

it('accepts signup redirects and ignores other incoming links', async () => {
  await mount();
  await act(async () => {
    receiveUrl({ url: 'prayerlock://reset-password#type=recovery&access_token=fixture&refresh_token=fixture' });
    receiveUrl({ url: 'prayerlock://verify-email#type=recovery&access_token=fixture&refresh_token=fixture' });
  });
  expect(setSession).not.toHaveBeenCalled();

  await act(async () => {
    receiveUrl({ url: 'prayerlock://verify-email#type=signup&access_token=fixture-access&refresh_token=fixture-refresh' });
  });
  expect(setSession).toHaveBeenCalledWith({
    access_token: 'fixture-access', refresh_token: 'fixture-refresh',
  });
});
