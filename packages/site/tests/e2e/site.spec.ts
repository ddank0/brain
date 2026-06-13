import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/brain/');
  });

  test('renders topbar with logo, tabs and search button', async ({ page }) => {
    await expect(page.locator('.logo')).toContainText('vault');
    await expect(page.locator('[data-tab="all"]')).toBeVisible();
    await expect(page.locator('[data-tab="dev"]')).toBeVisible();
    await expect(page.locator('[data-tab="study"]')).toBeVisible();
    await expect(page.locator('[data-tab="project"]')).toBeVisible();
    await expect(page.locator('[data-tab="docs"]')).toBeVisible();
    await expect(page.locator('#cmd-open')).toBeVisible();
  });

  test('renders stats strip with 4 cards', async ({ page }) => {
    await expect(page.locator('.stats-strip .stat-card')).toHaveCount(4);
    await expect(page.locator('.stat-label').first()).toBeVisible();
  });

  test('renders note list with at least one note', async ({ page }) => {
    await expect(page.locator('.note-row').first()).toBeVisible();
  });

  test('"all" tab is active by default', async ({ page }) => {
    await expect(page.locator('[data-tab="all"]')).toHaveClass(/active/);
  });

  test('tab "docs" shows only docs notes', async ({ page }) => {
    await page.locator('[data-tab="docs"]').click();
    // All visible rows should have data-note-type="docs"
    const visibleRows = page.locator('.note-row:not([hidden])');
    const count = await visibleRows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(visibleRows.nth(i)).toHaveAttribute('data-note-type', 'docs');
    }
  });

  test('tab "all" shows all notes after filtering', async ({ page }) => {
    // First filter to docs
    await page.locator('[data-tab="docs"]').click();
    // Then go back to all
    await page.locator('[data-tab="all"]').click();
    const allRows = page.locator('.note-row');
    const visibleRows = page.locator('.note-row:not([hidden])');
    const total = await allRows.count();
    const visible = await visibleRows.count();
    expect(visible).toBe(total);
  });

  test('tab filter hides non-matching notes', async ({ page }) => {
    // Click study tab (likely no study notes exist, but test the filtering logic)
    const studyRows = page.locator('[data-note-type="study"]');
    const studyCount = await studyRows.count();

    await page.locator('[data-tab="study"]').click();

    // Non-study rows should be hidden
    const noteRows = page.locator('[data-note-type="note"]');
    const noteCount = await noteRows.count();
    if (noteCount > 0) {
      await expect(noteRows.first()).toHaveAttribute('hidden', '');
    }
  });
});

test.describe('Command Palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/brain/');
  });

  test('opens on button click', async ({ page }) => {
    await page.locator('#cmd-open').click();
    await expect(page.locator('#cmd-palette')).toBeVisible();
  });

  test('opens on Ctrl+K', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cmd-palette')).toBeVisible();
  });

  test('closes on Esc', async ({ page }) => {
    await page.locator('#cmd-open').click();
    await expect(page.locator('#cmd-palette')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cmd-palette')).not.toBeVisible();
  });

  test('is horizontally centered on screen', async ({ page }) => {
    await page.locator('#cmd-open').click();
    await expect(page.locator('#cmd-palette')).toBeVisible();

    const viewport = page.viewportSize()!;
    const box = await page.locator('#cmd-palette').boundingBox();
    expect(box).not.toBeNull();

    const centerX = box!.x + box!.width / 2;
    const viewportCenterX = viewport.width / 2;
    // Allow 20px tolerance
    expect(Math.abs(centerX - viewportCenterX)).toBeLessThan(20);
  });

  test('shows search input when open', async ({ page }) => {
    await page.locator('#cmd-open').click();
    await expect(page.locator('#cmd-input')).toBeVisible();
    await expect(page.locator('#cmd-input')).toBeFocused();
  });

  test('shows results when typing', async ({ page }) => {
    await page.locator('#cmd-open').click();
    await page.locator('#cmd-input').fill('git');
    await page.waitForTimeout(300); // debounce
    // With fallback search, results should appear
    await expect(page.locator('#cmd-results')).not.toBeEmpty();
  });

  test('can navigate results with arrow keys', async ({ page }) => {
    await page.locator('#cmd-open').click();
    await page.locator('#cmd-input').fill('git');
    await page.waitForTimeout(300);

    const results = page.locator('.cmd-result');
    const count = await results.count();
    if (count > 0) {
      await page.keyboard.press('ArrowDown');
      await expect(results.first()).toHaveClass(/selected/);
    }
  });
});

test.describe('Note page', () => {
  test('renders note with all sections', async ({ page }) => {
    await page.goto('/brain/10_dev/git-workflows');

    await expect(page.locator('.breadcrumb')).toBeVisible();
    await expect(page.locator('.note-title')).toBeVisible();
    await expect(page.locator('.tags-row')).toBeVisible();
    await expect(page.locator('.note-meta')).toBeVisible();
    await expect(page.locator('.note-content')).toBeVisible();
  });

  test('breadcrumb shows domain and note name', async ({ page }) => {
    await page.goto('/brain/10_dev/git-workflows');
    await expect(page.locator('.breadcrumb')).toContainText('10_dev');
    await expect(page.locator('.breadcrumb')).toContainText('git-workflows');
  });

  test('tags link to tag pages', async ({ page }) => {
    await page.goto('/brain/10_dev/git-workflows');
    const firstTag = page.locator('.tags-row a').first();
    await expect(firstTag).toHaveAttribute('href', /\/brain\/tags\//);
  });
});

test.describe('Tag page', () => {
  test('renders notes for a tag', async ({ page }) => {
    await page.goto('/brain/tags/dev');
    await expect(page.locator('.note-row').first()).toBeVisible();
  });

  test('shows tag name in stats strip', async ({ page }) => {
    await page.goto('/brain/tags/dev');
    await expect(page.locator('.stat-label')).toContainText('#dev');
  });
});

test.describe('Navigation', () => {
  test('logo links to homepage', async ({ page }) => {
    await page.goto('/brain/10_dev/git-workflows');
    await page.locator('.logo').click();
    await expect(page).toHaveURL('/brain/');
  });

  test('note row navigates to note page', async ({ page }) => {
    await page.goto('/brain/');
    const firstNote = page.locator('.note-row').first();
    const href = await firstNote.getAttribute('href');
    await firstNote.click();
    await expect(page).toHaveURL(href!);
  });
});
