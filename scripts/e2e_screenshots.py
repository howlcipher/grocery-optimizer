import os
import sys
import time
from playwright.sync_api import sync_playwright

def run_e2e_and_capture_screenshots():
    os.makedirs("docs/images/mission-004", exist_ok=True)
    sample_receipt_path = os.path.abspath("docs/images/mission-004/sample_meijer_receipt.png")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ---------------------------------------------------------
        # 1. Desktop Flow (1280x850)
        # ---------------------------------------------------------
        print("[Desktop] Launching browser context...")
        desktop_context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = desktop_context.new_page()

        print("[Desktop] Navigating to http://localhost:5173...")
        page.goto("http://localhost:5173", wait_until="networkidle")
        page.wait_for_selector("#root")
        page.wait_for_timeout(500)

        # 1a. Search and add Whole Milk
        print("[Desktop] Searching and adding Whole Milk...")
        search_input = page.locator("#product-search-input")
        search_input.fill("Milk")
        page.wait_for_selector(".suggestion-item")
        page.locator(".suggestion-item").first.click()
        page.wait_for_timeout(400)

        # 1b. Search and add Eggs
        print("[Desktop] Searching and adding Eggs...")
        search_input.fill("Eggs")
        page.wait_for_selector(".suggestion-item")
        page.locator(".suggestion-item").first.click()
        page.wait_for_timeout(400)

        # 1c. Select User Observations mode
        print("[Desktop] Selecting User Observations mode...")
        user_obs_mode_btn = page.locator("button:has-text('User Observations')").first
        user_obs_mode_btn.click()
        page.wait_for_timeout(300)

        # 1d. Fill in ZIP 48042
        user_zip = page.locator("#user-zip-input")
        print("[Desktop] Setting area ZIP to 48042...")
        user_zip.fill("48042")
        page.wait_for_timeout(300)

        # 1e. Click Compare
        print("[Desktop] Clicking Compare User Prices...")
        compare_btn = page.locator("button:has-text('Compare User Prices')").first
        compare_btn.click()
        page.wait_for_selector(".provenance-pill", timeout=8000)
        page.wait_for_timeout(600)

        # 1f. Toggle Nearby Stores (Pilot Region)
        print("[Desktop] Toggling Nearby Stores (Pilot Region)...")
        nearby_stores_btn = page.locator("button:has-text('Nearby Stores')").first
        nearby_stores_btn.click()
        page.wait_for_timeout(1000)

        # Capture Desktop Regional Comparison
        print("[Desktop] Capturing desktop_regional_comparison.png...")
        page.screenshot(path="docs/images/mission-004/desktop_regional_comparison.png", full_page=False)

        # 1g. Open Record Store Prices Modal
        print("[Desktop] Opening Record Store Prices Modal...")
        record_price_btn = page.locator("button:has-text('+ Record Price')").first
        record_price_btn.click()
        page.wait_for_selector(".modal-card", timeout=5000)
        page.wait_for_timeout(300)

        # 1h. Switch to Shopping Trip mode
        print("[Desktop] Switching to Shopping Trip mode...")
        trip_mode_btn = page.locator("button:has-text('Shopping Trip')").first
        trip_mode_btn.click()
        page.wait_for_timeout(400)

        # 1i. Upload sample receipt image for in-browser OCR
        print("[Desktop] Uploading receipt photo for in-browser OCR...")
        file_input = page.locator("input[type='file'][accept*='image']").first
        file_input.set_input_files(sample_receipt_path)

        # Wait for OCR processing and staged items
        print("[Desktop] Waiting for in-browser OCR to complete...")
        page.locator(".confidence-pill").first.wait_for(timeout=25000)
        print("[Desktop] OCR parsed receipt and displayed confidence pills successfully!")
        page.locator(".confidence-pill").first.scroll_into_view_if_needed()
        page.wait_for_timeout(500)

        # Capture Desktop Receipt Assistant Staged
        print("[Desktop] Capturing desktop_receipt_assistant_staged.png...")
        page.screenshot(path="docs/images/mission-004/desktop_receipt_assistant_staged.png")

        desktop_context.close()

        # ---------------------------------------------------------
        # 2. Mobile Flow (390x844)
        # ---------------------------------------------------------
        print("[Mobile] Launching mobile context...")
        mobile_context = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
        )
        mobile_page = mobile_context.new_page()

        print("[Mobile] Navigating to http://localhost:5173 on mobile...")
        mobile_page.goto("http://localhost:5173", wait_until="networkidle")
        mobile_page.wait_for_selector("#root")
        mobile_page.wait_for_timeout(500)

        # Search and add item on mobile
        m_search = mobile_page.locator("#product-search-input")
        m_search.fill("Milk")
        mobile_page.wait_for_selector(".suggestion-item")
        mobile_page.locator(".suggestion-item").first.click()
        mobile_page.wait_for_timeout(400)

        m_user_obs = mobile_page.locator("button:has-text('User Observations')").first
        m_user_obs.click()
        mobile_page.wait_for_timeout(300)

        m_zip = mobile_page.locator("#user-zip-input")
        m_zip.fill("48042")
        mobile_page.wait_for_timeout(300)

        m_compare = mobile_page.locator("button:has-text('Compare User Prices')").first
        m_compare.click()
        mobile_page.wait_for_selector(".provenance-pill", timeout=8000)
        mobile_page.wait_for_timeout(600)

        m_nearby = mobile_page.locator("button:has-text('Nearby Stores')").first
        m_nearby.click()
        mobile_page.wait_for_timeout(1000)

        print("[Mobile] Capturing mobile_regional_comparison.png...")
        mobile_page.screenshot(path="docs/images/mission-004/mobile_regional_comparison.png")

        # Open Record Store Prices on Mobile
        m_record_btn = mobile_page.locator("button:has-text('+ Record Price')").first
        m_record_btn.click()
        mobile_page.wait_for_selector(".modal-card", timeout=5000)
        mobile_page.wait_for_timeout(300)

        m_trip_tab = mobile_page.locator("button:has-text('Shopping Trip')").first
        m_trip_tab.click()
        mobile_page.wait_for_timeout(400)

        m_file_input = mobile_page.locator("input[type='file'][accept*='image']").first
        m_file_input.set_input_files(sample_receipt_path)

        print("[Mobile] Waiting for OCR on mobile...")
        mobile_page.locator(".confidence-pill").first.wait_for(timeout=25000)
        print("[Mobile] OCR completed successfully on mobile!")

        # Scroll to show receipt items
        mobile_page.locator(".confidence-pill").first.scroll_into_view_if_needed()
        mobile_page.wait_for_timeout(500)

        print("[Mobile] Capturing mobile_receipt_assistant.png...")
        mobile_page.screenshot(path="docs/images/mission-004/mobile_receipt_assistant.png")

        mobile_context.close()
        browser.close()
        print("All screenshots successfully captured!")

if __name__ == "__main__":
    run_e2e_and_capture_screenshots()
