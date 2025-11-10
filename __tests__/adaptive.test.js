const createModule = () => {
  jest.resetModules();
  localStorage.clear();
  document.body.innerHTML = '';
  return require('../app.js');
};

describe('adaptive assistance', () => {
  let originalAddEventListener;

  beforeEach(() => {
    originalAddEventListener = document.addEventListener;
    document.addEventListener = function(type, listener, options) {
      if (type === 'DOMContentLoaded') return undefined;
      return originalAddEventListener.call(this, type, listener, options);
    };
  });

  afterEach(() => {
    document.addEventListener = originalAddEventListener;
  });

  test('updates adaptive rating after a strong win', () => {
    const app = createModule();
    app.__setSettings({ adaptive: true });
    app.saveAdaptive({ rating: 1000, lastDiff: 'easy' });
    app.updateAdaptiveOnEnd(true, 4, 'medium');
    const stored = app.loadAdaptive();
    expect(stored.rating).toBe(1006);
    expect(stored.lastDiff).toBe('medium');
  });

  test('provides extra preview and hints for lower ratings', () => {
    const app = createModule();
    app.__setSettings({ adaptive: true, previewSeconds: 0 });
    app.saveAdaptive({ rating: 900, lastDiff: 'easy' });
    const assist = app.getAdaptiveAssist('hard');
    expect(assist.previewSec).toBe(2);
    expect(assist.hintLimit).toBe(2);
  });

  test('decides next difficulty from stored rating', () => {
    const app = createModule();
    app.__setSettings({ adaptive: true });

    app.saveAdaptive({ rating: 900, lastDiff: 'easy' });
    expect(app.decideDifficulty()).toBe('easy');

    app.saveAdaptive({ rating: 950, lastDiff: 'medium' });
    expect(app.decideDifficulty()).toBe('medium');

    app.saveAdaptive({ rating: 1200, lastDiff: 'hard' });
    expect(app.decideDifficulty()).toBe('hard');
  });
});

describe('guide onboarding visibility', () => {
  let originalAddEventListener;

  beforeEach(() => {
    originalAddEventListener = document.addEventListener;
    document.addEventListener = function(type, listener, options) {
      if (type === 'DOMContentLoaded') return undefined;
      return originalAddEventListener.call(this, type, listener, options);
    };
    jest.resetModules();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.addEventListener = originalAddEventListener;
  });

  test('only auto shows guide for first run', () => {
    const app = require('../app.js');
    expect(app.shouldAutoShowGuide()).toBe(true);
    app.markGuideSeen();
    expect(app.shouldAutoShowGuide()).toBe(false);
  });
});
