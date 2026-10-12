// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ createBrowserClient: vi.fn(() => ({ real: true })) }));
vi.mock('@supabase/ssr', () => sdk);
import { createClient } from '@/lib/supabase/client';
import { isLandingDemoPath } from '@/lib/landingDemoClient';
import { installStub } from './dataAdapter';
import { createTrainingState } from './trainingState';

it('uses a local client on sample routes, blocks actions and credential-bearing requests', async () => {
  history.replaceState({}, '', '/demo');
  const network = vi.fn(); window.fetch = network;
  const model = createTrainingState(true);
  installStub({ userId:'owner-preview', tables:model.tables, onWrite:model.onWrite, respond:model.respond, passHosts:[/\.supabase\.co$/] });
  expect(sdk.createBrowserClient).not.toHaveBeenCalled();
  const client = createClient();
  await client.from('trips').insert({id:'would-be-real', title:'Sample', destination:'Paris, France'});
  expect(model.currentTrip().id).toBe('landing-practice');
  expect(network).not.toHaveBeenCalled();
  expect((await fetch('/demo', {method:'POST',headers:{'Next-Action':'real-action',RSC:'1'}})).status).toBe(403);
  expect((await fetch('https://example.supabase.co/rest/v1/trips')).status).toBe(503);
  expect(network).not.toHaveBeenCalled();
  expect(isLandingDemoPath('/trips/landing-practice/days/demo-day')).toBe(true);
  expect(isLandingDemoPath('/trips/real-trip')).toBe(false);
  expect(isLandingDemoPath('/democracy')).toBe(false);
  history.replaceState({}, '', '/');
  expect(createClient()).toEqual({real:true});
  expect(sdk.createBrowserClient).toHaveBeenCalledTimes(1);
});
