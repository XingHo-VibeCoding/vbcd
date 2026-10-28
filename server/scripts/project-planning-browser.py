"""可选本机浏览器验收：由 project-planning-selftest.mjs --browser 提供临时站点。"""
import asyncio
import base64
import json
import sys
from browser_use import Browser

async def main():
    url, plan_id = sys.argv[1:3]
    browser = Browser(headless=True, executable_path='/usr/bin/google-chrome', chromium_sandbox=False, enable_default_extensions=False, viewport={'width': 1280, 'height': 900})
    await browser.start()
    try:
        page = None
        async def value(script):
            return json.loads(await page.evaluate('(...args) => Promise.resolve((' + script + ')(...args)).then(v => JSON.stringify(v ?? false))'))
        async def wait_for(script):
            for _ in range(80):
                try:
                    if await value(script):
                        return
                except RuntimeError as error:
                    if not any(text in str(error) for text in ['Execution context was destroyed', 'Cannot find context', 'Not attached to an active page']):
                        raise
                await asyncio.sleep(0.15)
            print('页面诊断:', await page.evaluate('() => ({url:location.href,body:document.body?.innerText.slice(0,1600)})'))
            raise AssertionError('页面未出现预期状态: ' + script)
        async def click(text):
            await page.evaluate('(text) => { const b=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()===text); if(!b || b.disabled) throw Error("按钮不可操作: "+text); b.click(); }', text)
        page = await browser.new_page(url + '/planning?tab=tasks&plan=' + plan_id)
        await wait_for('() => document.body?.innerText.includes("浏览器前置")')
        assert await value('() => [...document.querySelectorAll("button")].filter(b=>["编辑","新增子任务"].includes(b.textContent.trim())).every(b=>b.disabled)')
        print('✅ 浏览器：游客任务列表可读，写入口灰显')
        login = await value('async () => (await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:"test-password"})})).status')
        assert login == 200
        page = await browser.new_page(url + '/planning?tab=tasks&plan=' + plan_id)
        await wait_for('() => [...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="编辑" && !b.disabled)')
        buttons = await page.get_elements_by_css_selector('li button')
        await buttons[0].click()
        inputs = await page.get_elements_by_css_selector('form input[type=text]')
        await inputs[0].fill('浏览器标题改动')
        await click('生成修改草案')
        await wait_for('() => location.pathname.includes("/planning/drafts/") && document.body?.innerText.includes("浏览器标题改动")')
        assert await value('async () => !(await (await fetch("/api/planning?task_status=all")).json()).data.project_tasks.some(t=>t.title==="浏览器标题改动")')
        await click('拒绝草案')
        await wait_for('() => document.body?.innerText.includes("已拒绝")')
        assert await value('async () => !(await (await fetch("/api/planning?task_status=all")).json()).data.project_tasks.some(t=>t.title==="浏览器标题改动")')
        print('✅ 浏览器：编辑先预览，拒绝后数据库原样')
        page = await browser.new_page(url + '/planning?tab=tasks&plan=' + plan_id)
        await wait_for('() => document.body?.innerText.includes("浏览器前置")')
        # 只对活跃列表生成排序草案；数据库在明确确认前不变。
        before = await value('async () => (await (await fetch("/api/planning?plan_id=' + plan_id + '")).json()).data.project_tasks.map(t=>t.id)')
        await click('下移（生成草案）')
        await wait_for('() => document.body?.innerText.includes("排序位置") && document.body?.innerText.includes("确认并保存")')
        await click('确认并保存')
        await wait_for('() => document.body?.innerText.includes("已批准并保存")')
        after = await value('async () => (await (await fetch("/api/planning?plan_id=' + plan_id + '")).json()).data.project_tasks.map(t=>t.id)')
        assert after == list(reversed(before))
        print('✅ 浏览器：重排差异可见，确认后顺序改变')
        page = await browser.new_page(url + '/planning?tab=tasks&plan=' + plan_id)
        await wait_for('() => document.body?.innerText.includes("浏览器前置")')
        image = await page.screenshot()
        with open('/tmp/vbcd-project-planning-ui.png', 'wb') as f:
            f.write(base64.b64decode(image))
        await page.set_viewport_size(390, 844)
        await asyncio.sleep(0.3)
        assert await value('() => document.documentElement.scrollWidth <= innerWidth + 1')
        mobile = await page.screenshot()
        with open('/tmp/vbcd-project-planning-mobile.png', 'wb') as f:
            f.write(base64.b64decode(mobile))
        print('✅ 浏览器：390px 手机布局无横向溢出')
        print('浏览器页面截图：/tmp/vbcd-project-planning-ui.png')
    finally:
        await browser.kill()

asyncio.run(main())
