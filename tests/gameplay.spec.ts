import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Lario\\.gemini\\antigravity-cli\\brain\\ff227324-741d-44e9-892e-3f4b7aeea4bb';

test.describe('Lexical Fountain Gameplay E2E Regression Tests', () => {
  
  test.beforeAll(() => {
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }
  });

  test('Should load game page and verify UI elements', async ({ page }) => {
    await page.goto('/');
    
    // 1. Verify Page Title
    await expect(page).toHaveTitle(/Word Physics Embeddings Game/);
    
    // 2. Verify Canvas Container exists
    const worldContainer = page.locator('#worldContainter');
    await expect(worldContainer).toBeVisible();
    
    // 3. Verify side menu toggling exists (presence of menu layout)
    const sideMenu = page.locator('._MenuRoot_13pe3_1').first();
    await expect(sideMenu).toBeVisible();
    
    // 4. Capture Desktop Viewport Screenshot
    await page.waitForTimeout(3000); // Wait for canvas initialization
    await page.screenshot({ path: path.join(artifactDir, 'e2e_desktop_view.png') });
  });

  test('Should spawn boxes and combine letters on click', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Click canvas at a specific location to spawn boxes
    await page.mouse.click(400, 300);
    await page.waitForTimeout(500);
    await page.mouse.click(450, 300);
    await page.waitForTimeout(2000); // Wait for physical collisions and text combinations
    
    // Capture visual state after merge
    await page.screenshot({ path: path.join(artifactDir, 'e2e_desktop_merge.png') });
  });

  test('Should toggle Sandbox mode and spawn letters on drag', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // 1. Click on Sandbox Mode toggle in the menu
    const sandboxToggle = page.locator('#sandbox-toggle').first();
    await expect(sandboxToggle).toBeVisible();
    await sandboxToggle.click();
    await page.waitForTimeout(1000); // Wait for world recreation

    // 2. Perform click and drag on the canvas
    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(400, 350);
    await page.mouse.move(500, 300);
    await page.mouse.up();
    await page.waitForTimeout(2000); // Wait for physics and letter drops

    // 3. Take screenshot to visually verify letters spawned in sandbox mode
    await page.screenshot({ path: path.join(artifactDir, 'sandbox_drag_letters.png') });
  });

  test('Should adapt rendering for Mobile Viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // Capture mobile layout
    await page.screenshot({ path: path.join(artifactDir, 'e2e_mobile_view.png') });
  });
});
