import os
import sys
import time
from playwright.sync_api import sync_playwright

def run_mission_005_e2e():
    output_dir = os.path.abspath("docs/images/mission-005")
    os.makedirs(output_dir, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ---------------------------------------------------------
        # 1. Desktop Flow (1280x900)
        # ---------------------------------------------------------
        print("[Desktop] Launching desktop browser context...")
        desktop = browser.new_context(viewport={"width": 1280, "height": 900})
        page = desktop.new_page()

        print("[Desktop] Navigating to http://127.0.0.1:5173...")
        page.goto("http://127.0.0.1:5173", wait_until="networkidle")
        page.wait_for_selector("#root")
        page.wait_for_timeout(500)

        # Step 1: Search and add Whole Milk to list
        print("[Desktop] Searching and adding Whole Milk to grocery list...")
        search_input = page.locator("#product-search-input")
        search_input.fill("Milk")
        page.wait_for_selector(".suggestion-item")
        page.locator(".suggestion-item").first.click()
        page.wait_for_timeout(400)

        # Step 2: Search and add Eggs to list
        print("[Desktop] Searching and adding Eggs to grocery list...")
        search_input.fill("Eggs")
        page.wait_for_selector(".suggestion-item")
        page.locator(".suggestion-item").first.click()
        page.wait_for_timeout(400)

        # Star both products in the list items
        print("[Desktop] Starring Whole Milk and Eggs as staples...")
        star_buttons = page.locator(".item-row .star-btn")
        star_buttons.first.click()
        page.wait_for_timeout(300)
        star_buttons.nth(1).click()
        page.wait_for_timeout(300)

        # Also search for coffee and capture search suggestion with star button
        search_input.fill("Cheerios")
        page.wait_for_selector(".suggestion-item")
        print("[Desktop] Capturing 02-starring-staples-in-search.png...")
        page.screenshot(path=os.path.join(output_dir, "02-starring-staples-in-search.png"))

        # Clear search
        search_input.fill("")
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)

        # Step 3: Open My Staples Drawer
        print("[Desktop] Opening My Staples drawer...")
        staples_btn = page.locator("button:has-text('My Staples')").first
        staples_btn.click()
        page.wait_for_selector("[aria-labelledby='staples-drawer-title']")
        page.wait_for_timeout(500)

        # Increment preferred quantity on first staple
        print("[Desktop] Incrementing preferred quantity...")
        inc_btn = page.locator("button[aria-label='Increase preferred quantity']").first
        inc_btn.click()
        page.wait_for_timeout(300)

        print("[Desktop] Capturing 03-my-staples-drawer.png...")
        page.screenshot(path=os.path.join(output_dir, "03-my-staples-drawer.png"))

        # Close drawer
        page.locator("button[aria-label='Close staples drawer']").click()
        page.wait_for_timeout(300)

        # Step 4: Click "+ New List" to test empty list with Staples quick-add
        print("[Desktop] Creating new empty list to showcase staples quick-add...")
        new_list_btn = page.locator("button:has-text('New List')").first
        new_list_btn.click()
        page.wait_for_timeout(500)

        print("[Desktop] Capturing 01-empty-list-quick-add-staples.png...")
        page.screenshot(path=os.path.join(output_dir, "01-empty-list-quick-add-staples.png"))

        # Step 5: Click "Add Staples" on the empty list to populate in one tap
        print("[Desktop] Clicking 'Add Staples' on empty list...")
        quick_add_staples = page.locator("button:has-text('Add Staples')").first
        quick_add_staples.click()
        page.wait_for_timeout(500)

        print("[Desktop] Capturing 04-one-tap-staples-added.png...")
        page.screenshot(path=os.path.join(output_dir, "04-one-tap-staples-added.png"))

        # Step 6: Open Saved Lists drawer to showcase Clone & Purchase History
        print("[Desktop] Opening Saved Lists drawer...")
        saved_lists_btn = page.locator("button:has-text('Saved Lists')").first
        saved_lists_btn.click()
        page.wait_for_selector("button:has-text('Clone')")
        page.wait_for_timeout(400)

        print("[Desktop] Capturing 05-saved-lists-drawer-clone.png...")
        page.screenshot(path=os.path.join(output_dir, "05-saved-lists-drawer-clone.png"))

        # Close drawer
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        # Step 7: Record a Shopping Trip to trigger Post-Trip Staples Learning
        print("[Desktop] Simulating trip submission in Record Price modal...")
        record_price_btn = page.locator("button:has-text('Record Price')").first
        record_price_btn.click()
        page.wait_for_selector(".modal-card")
        page.wait_for_timeout(400)

        trip_mode_btn = page.locator("button:has-text('Shopping Trip')").first
        trip_mode_btn.click()
        page.wait_for_timeout(300)

        page.locator("#obs-store-name").fill("Kroger #695")
        page.wait_for_timeout(200)

        # Add Bread to trip items
        trip_search = page.locator("input[placeholder*='Search product from receipt']")
        trip_search.fill("Bread")
        page.wait_for_selector(".suggestion-item")
        page.locator(".suggestion-item").first.click()
        page.wait_for_timeout(200)

        page.locator("input[placeholder='Price ($)']").fill("2.49")
        page.locator("button:has-text('+ Add Item')").click()
        page.wait_for_timeout(300)

        page.locator("button:has-text('Record Entire Trip')").first.click()
        page.wait_for_selector("[aria-labelledby='post-trip-title']", timeout=8000)
        page.wait_for_timeout(400)

        print("[Desktop] Capturing 06-post-trip-staples-learning.png...")
        page.screenshot(path=os.path.join(output_dir, "06-post-trip-staples-learning.png"))
        page.locator("button:has-text('Skip / Done')").click()
        page.wait_for_timeout(300)

        # ---------------------------------------------------------
        # 2. Mobile Viewport Flow (390x844 - iPhone 14)
        # ---------------------------------------------------------
        print("[Mobile] Launching mobile context (390x844)...")
        mobile = browser.new_context(viewport={"width": 390, "height": 844})
        mob_page = mobile.new_page()

        mob_page.goto("http://127.0.0.1:5173", wait_until="networkidle")
        mob_page.wait_for_selector("#root")
        mob_page.wait_for_timeout(500)

        # Open My Staples drawer on mobile
        mob_staples_btn = mob_page.locator("button:has-text('My Staples')").first
        mob_staples_btn.click()
        mob_page.wait_for_selector("[aria-labelledby='staples-drawer-title']")
        mob_page.wait_for_timeout(500)

        print("[Mobile] Capturing 07-mobile-staples-drawer.png...")
        mob_page.screenshot(path=os.path.join(output_dir, "07-mobile-staples-drawer.png"))

        browser.close()
        print("[Complete] All Mission 005 screenshots captured successfully!")

if __name__ == "__main__":
    run_mission_005_e2e()
