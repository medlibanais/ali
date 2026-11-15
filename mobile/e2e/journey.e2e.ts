// Full new-user journey, run in order on one fresh install:
// register -> confirm email -> sign in -> onboarding -> avatar -> Today ->
// complete a quest -> XP went up (on screen and in the database).
//
// Runs against the local Supabase (`npm run db:start`); see e2e/README.md.
import { execFileSync } from 'child_process';
import { expect as jestExpect } from '@jest/globals';
import { by, device, element, expect, waitFor } from 'detox';
import { confirmEmail, readProfile, readTotalXp, signInAs } from './support/backend';

const RUN = Date.now().toString(36);
const EMAIL = `e2e-${RUN}@grow.test`;
// Meets the app's rules: 8+ chars, an uppercase letter, a number, a symbol.
const PASSWORD = `Grow-${RUN}-9!`;
const USERNAME = `e2e_${RUN}`.slice(0, 20);
const FIRST_NAME = 'Detox';

const LONG = 30000;

/** Taps an element, scrolling its screen until it is on screen first. */
async function tapInScroll(id: string, scrollId: string, index = 0): Promise<void> {
  const target = element(by.id(id)).atIndex(index);
  await waitFor(target).toBeVisible().whileElement(by.id(scrollId)).scroll(250, 'down');
  await target.tap();
}

async function textOf(id: string): Promise<string> {
  const attrs = await element(by.id(id)).getAttributes();
  if ('text' in attrs && typeof attrs.text === 'string') return attrs.text;
  throw new Error(`#${id} has no text`);
}

function parseXp(text: string): number {
  return Number(text.replace(/[^0-9]/g, ''));
}

/** Android 13+ asks for notification permission on Today; grant it up front. */
function grantAndroidNotifications(): void {
  const adb = process.env.ANDROID_HOME
    ? `${process.env.ANDROID_HOME}/platform-tools/adb`
    : 'adb';
  try {
    execFileSync(adb, ['-s', device.id, 'shell', 'pm', 'grant', 'com.prayerlock.app',
      'android.permission.POST_NOTIFICATIONS']);
  } catch {
    // Older Android versions have no such permission.
  }
}

describe('New user journey', () => {
  let xpBefore = 0;

  beforeAll(async () => {
    await device.uninstallApp();
    await device.installApp();
    if (device.getPlatform() === 'android') grantAndroidNotifications();
    await device.launchApp({
      newInstance: true,
      permissions: { notifications: 'YES' },
      // The app has never-ending animations (ambient blobs, the breathing
      // avatar), so Detox would wait forever for it to go idle. Every step
      // below waits for its own element instead.
      launchArgs: { detoxEnableSynchronization: 0 },
    });
    await device.disableSynchronization();
  });

  it('1. registers a new account', async () => {
    await waitFor(element(by.id('login-create-account'))).toBeVisible().withTimeout(LONG);
    await element(by.id('login-create-account')).tap();

    await waitFor(element(by.id('register-email'))).toBeVisible().withTimeout(LONG);
    await element(by.id('register-email')).replaceText(EMAIL);
    await element(by.id('register-password')).replaceText(PASSWORD);
    await element(by.id('register-submit')).tap();

    // Email confirmation is on, so the app asks the user to check their inbox.
    await waitFor(element(by.text('Check your inbox'))).toBeVisible().withTimeout(LONG);
  });

  it('confirms the email and signs in', async () => {
    await confirmEmail(EMAIL);

    await element(by.id('verify-back-to-sign-in')).tap();
    await waitFor(element(by.id('login-email'))).toBeVisible().withTimeout(LONG);
    await element(by.id('login-email')).replaceText(EMAIL);
    await element(by.id('login-password')).replaceText(PASSWORD);
    await element(by.id('login-submit')).tap();

    await waitFor(element(by.text('Step 1 of 7'))).toBeVisible().withTimeout(LONG);
  });

  it('2. completes the onboarding', async () => {
    // Steps 1-6 have usable defaults; step 7 needs a name and a username.
    for (let step = 1; step <= 6; step += 1) {
      await waitFor(element(by.text(`Step ${step} of 7`))).toExist().withTimeout(LONG);
      await tapInScroll('onboarding-continue', 'onboarding-scroll');
    }
    await waitFor(element(by.id('onboarding-first-name'))).toBeVisible().withTimeout(LONG);
    await element(by.id('onboarding-first-name')).replaceText(FIRST_NAME);
    await element(by.id('onboarding-username')).replaceText(USERNAME);
    await tapInScroll('onboarding-continue', 'onboarding-scroll');

    // Next stop is the avatar. Skip the photo/AI path and build it by hand.
    await waitFor(element(by.id('ai-avatar-design-by-hand'))).toBeVisible().withTimeout(LONG);

    const client = await signInAs(EMAIL, PASSWORD);
    const profile = await readProfile(client);
    jestExpect(profile.onboarding_completed).toBe(true);
    jestExpect(profile.username).toBe(USERNAME);
  });

  it('3. creates a custom avatar and saves it', async () => {
    await element(by.id('ai-avatar-design-by-hand')).tap();
    await waitFor(element(by.id('avatar-randomize'))).toBeVisible().withTimeout(LONG);

    // Customize: a few rolls of the dice so the look differs from the default.
    for (let i = 0; i < 3; i += 1) {
      await element(by.id('avatar-randomize')).tap();
    }
    await element(by.id('avatar-save')).tap();

    // Saving at the end of onboarding opens the app on Today.
    await waitFor(element(by.id('today-scroll'))).toBeVisible().withTimeout(LONG);

    const client = await signInAs(EMAIL, PASSWORD);
    const profile = await readProfile(client);
    jestExpect(profile.avatar_config).not.toBeNull();
    jestExpect(Object.keys(profile.avatar_config ?? {}).length).toBeGreaterThan(0);
  });

  it('4. completes a quest on the Today screen', async () => {
    // Note the XP before, from the progress strip under the quests.
    await waitFor(element(by.id('today-total-xp')))
      .toBeVisible()
      .whileElement(by.id('today-scroll'))
      .scroll(250, 'down');
    xpBefore = parseXp(await textOf('today-total-xp'));

    await element(by.id('today-scroll')).scrollTo('top');
    await waitFor(element(by.id('quest-complete')).atIndex(0)).toExist().withTimeout(LONG);
    await tapInScroll('quest-complete', 'today-scroll');
  });

  it('5. shows more XP than before', async () => {
    await waitFor(element(by.id('today-total-xp')))
      .toBeVisible()
      .whileElement(by.id('today-scroll'))
      .scroll(250, 'down');
    // The XP refreshes once the server confirms the completion.
    let xpAfter = xpBefore;
    const deadline = Date.now() + LONG;
    while (xpAfter <= xpBefore && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      xpAfter = parseXp(await textOf('today-total-xp'));
    }
    jestExpect(xpAfter).toBeGreaterThan(xpBefore);

    // The server (complete_quest RPC) is the only writer of XP; check it too.
    const client = await signInAs(EMAIL, PASSWORD);
    jestExpect(await readTotalXp(client)).toBe(xpAfter);
    await expect(element(by.id('today-total-xp'))).toBeVisible();
  });
});
