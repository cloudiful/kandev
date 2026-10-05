import { expect, test } from "../../fixtures/test-base";
import { controlHeight } from "../../helpers/control-sizing";
import { mockFolderAvailability } from "../../helpers/open-task-folder";
import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type { BackendContext } from "../../fixtures/backend";

const HIDDEN_DIRECTORY = ".hidden-project";
const VISIBLE_DIRECTORY = "visible-project";
const TOUCH_TARGET_PX = 44;

/**
 * The e2e backend runs with HOME set to its temporary root, so a directory
 * browser opened without a chosen value lists that root. A hidden child of that
 * root is what the reveal has to expose, and it keeps the fixture out of the
 * developer's real home.
 */
function createBrowsableDirectories(backend: BackendContext): void {
  fs.mkdirSync(path.join(backend.tmpDir, HIDDEN_DIRECTORY), { recursive: true });
  fs.mkdirSync(path.join(backend.tmpDir, VISIBLE_DIRECTORY), { recursive: true });
}

async function openFolderRowPicker(page: Page): Promise<ReturnType<typeof page.locator>> {
  const trigger = page.getByTestId("folder-picker-trigger").last();
  await trigger.click();
  const picker = page.locator('[data-testid="folder-picker-popover"][data-state="open"]').last();
  await expect(picker).toBeVisible();
  return picker;
}

/** Opens the task's Add Repositories to workspace dialog with one empty folder
 * row, which is the directory browser this feature owns. */
async function openFolderSourceDialog(page: Page, taskId: string) {
  await page.goto(`/t/${taskId}`);
  await page.getByTestId("files-workspace-actions").click();
  await page.getByRole("menuitem", { name: "Add Repositories to workspace" }).click();
  const dialog = page.getByTestId("add-workspace-sources-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Add folder" }).click();
  await expect(dialog.getByTestId("workspace-source-row")).toBeVisible();
  return dialog;
}

test.describe("Directory browser hidden folders", () => {
  test.beforeEach(async ({ testPage }) => {
    await mockFolderAvailability(testPage, true);
    await testPage.route("**/api/v1/task-sessions/*/open-folder", (route) =>
      route.fulfill({ json: { success: true } }),
    );
  });

  // @covers AC-WORKSPACES-HIDDEN-FOLDERS-001.1, AC-WORKSPACES-HIDDEN-FOLDERS-001.2
  test("keeps hidden directories out of the listing until the reveal is asked for", async ({
    testPage,
    apiClient,
    seedData,
    backend,
    prCapture,
  }) => {
    test.setTimeout(120_000);
    createBrowsableDirectories(backend);
    const task = await apiClient.createTaskWithAgent(
      seedData.workspaceId,
      "Hidden folders stay out by default",
      seedData.agentProfileId,
      {
        description: "/e2e:simple-message",
        workflow_id: seedData.workflowId,
        workflow_step_id: seedData.startStepId,
        repository_ids: [seedData.repositoryId],
        executor_profile_id: seedData.worktreeExecutorProfileId,
      },
    );

    await openFolderSourceDialog(testPage, task.id);
    const picker = await openFolderRowPicker(testPage);

    // @covers AC-WORKSPACES-HIDDEN-FOLDERS-001.6
    const entries = picker.getByTestId("folder-picker-entry");
    await expect(entries.filter({ hasText: VISIBLE_DIRECTORY })).toHaveCount(1);
    await expect(entries.filter({ hasText: HIDDEN_DIRECTORY })).toHaveCount(0);
    // A switch names the thing it controls and reports its own state.
    await expect(picker.getByRole("switch", { name: "Hidden folders" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await prCapture.screenshot("directory-browser-hidden-off", { fullPage: false });
  });

  // @covers AC-WORKSPACES-HIDDEN-FOLDERS-001.3
  test("reveals, enters, and selects a hidden directory", async ({
    testPage,
    apiClient,
    seedData,
    backend,
    prCapture,
  }) => {
    test.setTimeout(120_000);
    createBrowsableDirectories(backend);
    const task = await apiClient.createTaskWithAgent(
      seedData.workspaceId,
      "Reveal a hidden directory",
      seedData.agentProfileId,
      {
        description: "/e2e:simple-message",
        workflow_id: seedData.workflowId,
        workflow_step_id: seedData.startStepId,
        repository_ids: [seedData.repositoryId],
        executor_profile_id: seedData.worktreeExecutorProfileId,
      },
    );

    await openFolderSourceDialog(testPage, task.id);
    const picker = await openFolderRowPicker(testPage);
    const entries = picker.getByTestId("folder-picker-entry");
    const hiddenEntry = entries.filter({ hasText: HIDDEN_DIRECTORY });

    await picker.getByTestId("directory-browser-show-hidden").click();

    // @covers AC-WORKSPACES-HIDDEN-FOLDERS-001.5
    await expect(hiddenEntry).toHaveCount(1);
    await expect(picker.getByRole("switch", { name: "Hidden folders" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // The reveal re-lists the directory the user is already in, so the ordinary
    // sibling is still there and nothing navigated away.
    await expect(entries.filter({ hasText: VISIBLE_DIRECTORY })).toHaveCount(1);
    await prCapture.screenshot("directory-browser-hidden-on", { fullPage: false });

    await hiddenEntry.click();
    // @covers AC-WORKSPACES-HIDDEN-FOLDERS-001.8
    await expect(picker.getByRole("button", { name: HIDDEN_DIRECTORY, exact: true })).toBeVisible();

    // Toggling while nested must not discard the position: a display-only
    // preference change re-lists the directory on screen, never the home root.
    await picker.getByRole("switch", { name: "Hidden folders" }).click();
    await expect(picker.getByRole("switch", { name: "Hidden folders" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(picker.getByRole("button", { name: HIDDEN_DIRECTORY, exact: true })).toBeVisible();
    await picker.getByRole("switch", { name: "Hidden folders" }).click();
    await expect(picker.getByRole("switch", { name: "Hidden folders" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const choose = picker.getByTestId("folder-picker-choose");
    await expect(choose).toBeEnabled();
    await choose.click();

    await expect(testPage.getByTestId("folder-picker-trigger").last()).toContainText(
      HIDDEN_DIRECTORY,
    );
  });

  // @covers AC-WORKSPACES-HIDDEN-FOLDERS-001.9, AC-WORKSPACES-HIDDEN-FOLDERS-001.10
  test("keeps the control keyboard reachable and compact for a fine pointer", async ({
    testPage,
    apiClient,
    seedData,
    backend,
  }) => {
    test.setTimeout(120_000);
    createBrowsableDirectories(backend);
    const task = await apiClient.createTaskWithAgent(
      seedData.workspaceId,
      "Reveal control is keyboard reachable",
      seedData.agentProfileId,
      {
        description: "/e2e:simple-message",
        workflow_id: seedData.workflowId,
        workflow_step_id: seedData.startStepId,
        repository_ids: [seedData.repositoryId],
        executor_profile_id: seedData.worktreeExecutorProfileId,
      },
    );

    await openFolderSourceDialog(testPage, task.id);
    const picker = await openFolderRowPicker(testPage);
    const control = picker.getByRole("switch", { name: "Hidden folders" });

    // A real control, reachable by keyboard, naming the thing it controls and
    // reporting its state to assistive technology.
    await expect(control).toHaveRole("switch");
    await control.focus();
    await expect(control).toBeFocused();
    // Operable without a pointer.
    await control.press("Enter");
    await expect(control).toHaveAttribute("aria-checked", "true");

    // The fine-pointer composition keeps the compact control; the coarse-pointer
    // minimum belongs to the mobile project.
    expect(await controlHeight(control)).toBeLessThan(TOUCH_TARGET_PX);
  });
});
