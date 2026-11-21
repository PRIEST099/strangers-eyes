// T-094: SCR-22 banner selection and the system status store (ui/systemStatus.ts, D-105).
import { describe, expect, it, vi } from 'vitest';
import template from '@root/remoteconfig.template.json';
import { t } from '../core/strings';
import {
  BANNER_COPY,
  CLOUD_OFF_ORDER,
  INITIAL_STATUS,
  RATE_LIMIT_MS,
  TEMPLATE_DAILY_CAP,
  TRANSIENT_EVENTS,
  chipInputsOf,
  clampDailyCap,
  cloudOffReason,
  cloudRowOf,
  createSystemStatusStore,
  selectBanners,
  type CloudOff,
  type StatusTimers,
  type SystemStatus,
} from './systemStatus';

const S = (over: Partial<SystemStatus> = {}): SystemStatus => ({ ...INITIAL_STATUS, ...over });

/** The status that makes one cloud-off reason true (and nothing else). */
const ONLY: Record<CloudOff, { s: SystemStatus; used: number }> = {
  tripwire: { s: S({ tripwire: true }), used: 0 },
  killSwitch: { s: S({ killSwitch: true }), used: 0 },
  appCheck: { s: S({ appCheckFailed: true }), used: 0 },
  auth: { s: S({ authFailed: true }), used: 0 },
  dailyCap: { s: S({ dailyCap: 3 }), used: 3 },
};

function fakeTimers() {
  const pending = new Map<number, () => void>();
  let id = 0;
  const timers: StatusTimers = {
    setTimeout: (fn) => { pending.set(++id, fn); return id; },
    clearTimeout: (h) => { pending.delete(h as number); },
  };
  return { timers, pending, fire: () => { for (const [k, fn] of [...pending]) { pending.delete(k); fn(); } } };
}

describe('the bundled cap default comes from the RC template', () => {
  it('equals daily_adversary_cap', () => {
    expect(TEMPLATE_DAILY_CAP).toBe(Number(template.parameters.daily_adversary_cap.defaultValue.value));
    expect(INITIAL_STATUS.dailyCap).toBe(TEMPLATE_DAILY_CAP);
  });

  it('clampDailyCap: 1–200, floored; non-numbers rejected', () => {
    expect(clampDailyCap(20)).toBe(20);
    expect(clampDailyCap(0)).toBe(1);
    expect(clampDailyCap(-5)).toBe(1);
    expect(clampDailyCap(500)).toBe(200);
    expect(clampDailyCap(7.9)).toBe(7);
    expect(clampDailyCap(Number.NaN)).toBeNull();
    expect(clampDailyCap(Infinity)).toBeNull();
    expect(clampDailyCap('20' as unknown as number)).toBeNull();
  });
});

describe('selectBanners: each condition shows its copy (AC-290)', () => {
  it('nothing reported → no banner', () => {
    expect(selectBanners(INITIAL_STATUS, 0)).toEqual([]);
    expect(cloudOffReason(INITIAL_STATUS, 0)).toBeNull();
  });

  it.each(CLOUD_OFF_ORDER)('%s alone', (kind) => {
    const { s, used } = ONLY[kind];
    expect(cloudOffReason(s, used)).toBe(kind);
    const b = selectBanners(s, used);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ kind, copy: BANNER_COPY[kind], dismissible: false, tone: kind === 'tripwire' ? 'danger' : 'warn' });
  });

  it('SPEC SCR-22 copy ids', () => {
    expect(BANNER_COPY).toEqual({
      tripwire: 'copy.gate.tripwire', killSwitch: 'copy.err.killSwitch', appCheck: 'copy.err.appCheck', auth: 'copy.err.auth',
      dailyCap: 'copy.err.dailyCap', rateLimit: 'copy.err.rateLimit', network: 'copy.err.network', cloudFailed: 'copy.err.cloudFailed',
    });
  });

  it('the daily cap banner names the cap; the cap is reached at used ≥ cap, not before', () => {
    expect(cloudOffReason(S({ dailyCap: 20 }), 19)).toBeNull();
    expect(cloudOffReason(S({ dailyCap: 20 }), 20)).toBe('dailyCap');
    expect(cloudOffReason(S({ dailyCap: 20 }), 21)).toBe('dailyCap');
    const [b] = selectBanners(S({ dailyCap: 20 }), 20);
    expect(b.params).toEqual({ cap: 20 });
    expect(t(b.copy, b.params)).toContain('20 cloud checks');
  });

  it.each(TRANSIENT_EVENTS)('event %s alone: dismissible, polite', (e) => {
    const [b] = selectBanners(S({ events: [e] }), 0);
    expect(b).toMatchObject({ kind: e, copy: BANNER_COPY[e], dismissible: true, tone: 'warn' });
  });

  it('several events show in a fixed order', () => {
    const b = selectBanners(S({ events: ['cloudFailed', 'network', 'rateLimit'] }), 0);
    expect(b.map((x) => x.kind)).toEqual(['rateLimit', 'network', 'cloudFailed']);
  });

  it('precedence: tripwire > kill switch > App Check > sign-in > daily cap, and only ONE cloud-off banner', () => {
    const withReasons = (rs: readonly CloudOff[]): SystemStatus => S({
      tripwire: rs.includes('tripwire'), killSwitch: rs.includes('killSwitch'), appCheckFailed: rs.includes('appCheck'),
      authFailed: rs.includes('auth'), dailyCap: rs.includes('dailyCap') ? 1 : 200, events: [...TRANSIENT_EVENTS],
    });
    CLOUD_OFF_ORDER.forEach((kind, i) => {
      const b = selectBanners(withReasons(CLOUD_OFF_ORDER.slice(i)), 5);
      expect(b.map((x) => x.kind)).toEqual([kind]);
    });
  });

  it('events are hidden (not cleared) while the cloud is off', () => {
    const s = S({ killSwitch: true, events: ['rateLimit', 'network'] });
    expect(selectBanners(s, 0).map((b) => b.kind)).toEqual(['killSwitch']);
    expect(selectBanners({ ...s, killSwitch: false }, 0).map((b) => b.kind)).toEqual(['rateLimit', 'network']);
  });
});

describe('cloudRowOf / chipInputsOf: SCR-02 row 3 and the header chip agree with the banner', () => {
  it.each<[CloudOff | null, string, { killSwitch: boolean; capReached: boolean }]>([
    [null, 'ready', { killSwitch: false, capReached: false }],
    ['tripwire', 'paused', { killSwitch: true, capReached: false }],
    ['killSwitch', 'paused', { killSwitch: true, capReached: false }],
    ['appCheck', 'appCheckFail', { killSwitch: true, capReached: false }],
    ['auth', 'appCheckFail', { killSwitch: true, capReached: false }],
    ['dailyCap', 'cap', { killSwitch: false, capReached: true }],
  ])('%s → row %s', (off, row, chip) => {
    expect(cloudRowOf(off)).toBe(row);
    expect(chipInputsOf(off)).toEqual(chip);
  });
});

describe('the store', () => {
  it('set: RC and boot flags; invalid values ignored; no notification when nothing changed', () => {
    const st = createSystemStatusStore(fakeTimers().timers);
    const l = vi.fn();
    st.subscribe(l);
    st.set({ killSwitch: true, dailyCap: 5 });
    expect(st.get()).toMatchObject({ killSwitch: true, dailyCap: 5 });
    expect(l).toHaveBeenCalledTimes(1);
    st.set({ killSwitch: true, dailyCap: 5 });
    st.set({ killSwitch: 'yes' as unknown as boolean, dailyCap: Number.NaN });
    expect(l).toHaveBeenCalledTimes(1);
    st.set({ dailyCap: 999 });
    expect(st.get().dailyCap).toBe(200);
    st.set({ killSwitch: false, appCheckFailed: true, authFailed: true });
    expect(st.get()).toMatchObject({ killSwitch: false, appCheckFailed: true, authFailed: true });
  });

  it('the tripwire only ever turns on, and only through markTripwire: set() cannot touch it, dismiss() cannot clear it', () => {
    const st = createSystemStatusStore(fakeTimers().timers);
    st.set({ tripwire: true } as never);
    expect(st.get().tripwire).toBe(false);
    st.markTripwire();
    expect(st.get().tripwire).toBe(true);
    st.set({ tripwire: false } as never);
    expect(st.get().tripwire).toBe(true);
    st.dismiss('tripwire');
    expect(st.get().tripwire).toBe(true);
    expect(selectBanners(st.get(), 0).map((b) => b.kind)).toEqual(['tripwire']);
  });

  it('report adds an event once; dismiss removes only events', () => {
    const st = createSystemStatusStore(fakeTimers().timers);
    st.report('network');
    st.report('network');
    st.report('cloudFailed');
    expect(st.get().events).toEqual(['network', 'cloudFailed']);
    st.set({ killSwitch: true });
    st.dismiss('killSwitch');
    expect(st.get().killSwitch).toBe(true);
    st.dismiss('network');
    expect(st.get().events).toEqual(['cloudFailed']);
    st.report('bogus' as never);
    expect(st.get().events).toEqual(['cloudFailed']);
  });

  it('a rate-limit banner clears itself after 60 s; a repeat restarts the wait; dismissing cancels the timer', () => {
    const ft = fakeTimers();
    const set = vi.spyOn(ft.timers, 'setTimeout');
    const st = createSystemStatusStore(ft.timers);
    st.report('rateLimit');
    expect(set).toHaveBeenLastCalledWith(expect.any(Function), RATE_LIMIT_MS);
    st.report('rateLimit');
    expect(ft.pending.size).toBe(1); // the first timer was cleared
    ft.fire();
    expect(st.get().events).toEqual([]);
    st.report('rateLimit');
    st.dismiss('rateLimit');
    expect(ft.pending.size).toBe(0);
    expect(RATE_LIMIT_MS).toBe(60_000);
  });

  it('clearEvents drops every event and cancels the 429 timer; with nothing to clear it does not notify', () => {
    const ft = fakeTimers();
    const st = createSystemStatusStore(ft.timers);
    st.report('rateLimit');
    st.report('network');
    const l = vi.fn();
    st.subscribe(l);
    st.clearEvents();
    expect(st.get().events).toEqual([]);
    expect(ft.pending.size).toBe(0);
    expect(l).toHaveBeenCalledTimes(1);
    st.clearEvents();
    expect(l).toHaveBeenCalledTimes(1);
    st.markTripwire();
    st.clearEvents();
    expect(st.get().tripwire).toBe(true); // only events go
  });

  it('unsubscribe stops notifications', () => {
    const st = createSystemStatusStore(fakeTimers().timers);
    const l = vi.fn();
    const off = st.subscribe(l);
    off();
    st.report('network');
    expect(l).not.toHaveBeenCalled();
  });
});
