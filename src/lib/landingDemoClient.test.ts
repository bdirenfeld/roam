import { expect, it } from 'vitest';
import { getLandingDemoClient, isLandingDemoPath } from './landingDemoClient';

it('isolates only sample routes, never real journeys or similar public paths', () => {
  expect(isLandingDemoPath('/demo?')).toBe(false);
  expect(isLandingDemoPath('/demo')).toBe(true);
  expect(isLandingDemoPath('/demo/photo')).toBe(true);
  expect(isLandingDemoPath('/trips/landing-sample/days/sample-day')).toBe(true);
  expect(isLandingDemoPath('/trips/landing-practice/map')).toBe(true);
  expect(isLandingDemoPath('/trips/landing-practice-other/map')).toBe(false);
  expect(isLandingDemoPath('/trips/real-journey/map')).toBe(false);
  expect(isLandingDemoPath('/demo-account')).toBe(false);
});
it('starts without an account and supplies one stable local client to native components', async () => {
  const local = getLandingDemoClient();
  const auth = local.auth as {getSession:()=>Promise<{data:{session:null}}>};
  expect((await auth.getSession()).data.session).toBeNull();
  expect(getLandingDemoClient()).toBe(local);
});
