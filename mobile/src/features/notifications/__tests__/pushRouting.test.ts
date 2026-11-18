import { routeForPush } from '../pushRouting';

describe('routeForPush', () => {
  it('opens Today with the weakest pillar for a streak-risk push', () => {
    expect(routeForPush({ type: 'streak_risk', screen: 'Today', pillar: 'family', streak: 4 })).toEqual({
      screen: 'Today',
      pillar: 'family',
    });
  });

  it('ignores an unknown pillar but still opens Today', () => {
    expect(routeForPush({ screen: 'Today', pillar: 'sleep' })).toEqual({ screen: 'Today' });
  });

  it('opens Friends for friend events', () => {
    expect(routeForPush({ type: 'friend_request' })).toEqual({ screen: 'Friends' });
  });

  it('falls back to the notification center', () => {
    expect(routeForPush({ type: 'weekly_report' })).toEqual({ screen: 'Notifications' });
    expect(routeForPush(null)).toEqual({ screen: 'Notifications' });
    expect(routeForPush('garbage')).toEqual({ screen: 'Notifications' });
  });
});
