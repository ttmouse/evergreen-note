#!/usr/bin/env python3
"""把本项目组装成一个可双击运行的 macOS .app（不依赖 electron-builder）。

做法与原作者一致：拿 Electron 的 dist 包，改名为自己的 app，
再把应用文件放进 Contents/Resources/app/ 并把资源放好。

与原作者构建方式的唯一差别：他的 Contents/Resources/server/ 是 PyInstaller 二进制，
这里是本项目的 server/server.mjs（Node，靠 ELECTRON_RUN_AS_NODE 以纯 Node 方式运行）。

用法: build-desktop-app.py [--name "Evergreen note"] [--out "notekit-src/build/Evergreen note.app"]
默认更新已安装的同一个应用；覆盖前只读出旧包的 Bundle ID 与图标，不做备份。
"""
import argparse
import json
import os
import plistlib
import shutil
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, 'notekit-src')

# 放进 Resources/app/ 的东西（运行期需要，且都不需要 node_modules）
APP_ITEMS = ['package.json', 'dist', 'server', 'desktop']


def run(cmd):
    print('  $', ' '.join(cmd))
    subprocess.run(cmd, check=True)


def read_prior_app(app_path):
    """读旧应用的 Info.plist 与图标，供覆盖时沿用 Bundle ID 和自定义图标。

    返回 (plist, 图标文件名, 图标声明名, 图标字节)；读不到就是空值。
    """
    plist_path = os.path.join(app_path, 'Contents', 'Info.plist')
    if not os.path.isfile(plist_path):
        return {}, None, None, None
    with open(plist_path, 'rb') as f:
        pl = plistlib.load(f)
    icon = pl.get('CFBundleIconFile', 'electron.icns')
    icon_file = icon if icon.endswith('.icns') else icon + '.icns'
    icon_path = os.path.join(app_path, 'Contents', 'Resources', icon_file)
    if not os.path.isfile(icon_path):
        return pl, None, None, None
    with open(icon_path, 'rb') as f:
        return pl, icon_file, icon, f.read()


def patch_plist(path, **kv):
    with open(path, 'rb') as f:
        pl = plistlib.load(f)
    pl.update(kv)
    with open(path, 'wb') as f:
        plistlib.dump(pl, f)


def main():
    ap = argparse.ArgumentParser()
    with open(os.path.join(SRC, 'package.json'), encoding='utf-8') as f:
        source_package = json.load(f)
    ap.add_argument('--name', default=source_package['productName'])
    ap.add_argument('--out', default=None)
    args = ap.parse_args()
    name = args.name
    out = args.out or os.path.join(SRC, 'build', f'{name}.app')

    electron_app = os.path.join(SRC, 'node_modules/electron/dist/Electron.app')
    if not os.path.isdir(electron_app):
        sys.exit(f'找不到 Electron：{electron_app}（先 pnpm install）')
    if not os.path.isdir(os.path.join(SRC, 'dist')):
        sys.exit('找不到 dist/：先 pnpm build')

    print(f'[1/6] 复制 Electron → {out}')
    # 覆盖前先读出旧包的身份信息，读完就删，不留备份。
    prior_plist = {}
    prior_icon_name = prior_icon_value = prior_icon = None
    if os.path.exists(out):
        prior_plist, prior_icon_name, prior_icon_value, prior_icon = read_prior_app(out)
        print(f'      删除旧应用：{out}')
        shutil.rmtree(out)
    elif source_package.get('profileName'):
        previous = os.path.join(SRC, 'build', source_package['profileName'] + '.app')
        prior_plist, prior_icon_name, prior_icon_value, prior_icon = read_prior_app(previous)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    shutil.copytree(electron_app, out, symlinks=True,
                    ignore=shutil.ignore_patterns('default_app.asar'))

    c = os.path.join(out, 'Contents')

    print(f'[2/6] 重命名主可执行文件 Electron → {name}')
    os.rename(os.path.join(c, 'MacOS/Electron'), os.path.join(c, f'MacOS/{name}'))

    print('[3/6] 重命名 Helper（Electron 靠 CFBundleName 定位它们，必须同步）')
    fw = os.path.join(c, 'Frameworks')
    for entry in sorted(os.listdir(fw)):
        if not (entry.startswith('Electron Helper') and entry.endswith('.app')):
            continue
        suffix = entry[len('Electron Helper'):]          # '' 或 ' (GPU).app'
        old_dir = os.path.join(fw, entry)
        new_dir = os.path.join(fw, f'{name} Helper{suffix}')
        os.rename(old_dir, new_dir)
        hc = os.path.join(new_dir, 'Contents')
        macos = os.path.join(hc, 'MacOS')
        for exe in os.listdir(macos):
            if exe.startswith('Electron Helper'):
                exe_suffix = exe[len('Electron Helper'):]
                os.rename(os.path.join(macos, exe),
                          os.path.join(macos, f'{name} Helper{exe_suffix}'))
                patch_plist(
                    os.path.join(hc, 'Info.plist'),
                    CFBundleExecutable=f'{name} Helper{exe_suffix}',
                    CFBundleName=f'{name} Helper{suffix[:-4]}',
                    CFBundleDisplayName=f'{name} Helper{suffix[:-4]}',
                    CFBundleIdentifier=f'com.local.{name.lower().replace(" ", "")}.helper{suffix[:-4].strip(" ()").lower()}',
                )
        print(f'      {entry} → {os.path.basename(new_dir)}')

    print('[4/6] 改写主 Info.plist')
    with open(os.path.join(SRC, 'package.json'), encoding='utf-8') as f:
        version = json.load(f)['version']
    patch_plist(
        os.path.join(c, 'Info.plist'),
        CFBundleName=name,
        CFBundleDisplayName=name,
        CFBundleExecutable=name,
        CFBundleShortVersionString=version,
        CFBundleVersion=version,
        CFBundleIdentifier=prior_plist.get('CFBundleIdentifier',
                                         'com.local.notekit.clean' if name == 'Notekit' else f'com.local.{name.lower().replace(" ", "")}'),
    )
    source_icon = os.path.join(SRC, 'desktop', 'assets', 'app-icon.icns')
    if os.path.isfile(source_icon):
        shutil.copy2(source_icon, os.path.join(c, 'Resources', 'electron.icns'))
        patch_plist(os.path.join(c, 'Info.plist'), CFBundleIconFile='electron.icns')
    elif prior_icon:
        with open(os.path.join(c, 'Resources', prior_icon_name), 'wb') as f:
            f.write(prior_icon)
        patch_plist(os.path.join(c, 'Info.plist'), CFBundleIconFile=prior_icon_value)

    print('[5/6] 放入应用文件到 Contents/Resources/app/')
    app_dir = os.path.join(c, 'Resources', 'app')
    os.makedirs(app_dir, exist_ok=True)
    for item in APP_ITEMS:
        s = os.path.join(SRC, item)
        d = os.path.join(app_dir, item)
        if not os.path.exists(s):
            sys.exit(f'缺少 {s}')
        if os.path.isdir(s):
            shutil.copytree(s, d, symlinks=True,
                            ignore=shutil.ignore_patterns('node_modules', '.server-data'))
        else:
            shutil.copy2(s, d)
        print(f'      {item}')

    # 显示名称跟随目标应用；profileName 与 defaultPort 保持原有数据身份。
    package_path = os.path.join(app_dir, 'package.json')
    with open(package_path, encoding='utf-8') as f:
        package = json.load(f)
    package['productName'] = name
    with open(package_path, 'w', encoding='utf-8') as f:
        json.dump(package, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print('[6/6] ad-hoc 签名（改动会使原签名失效）')
    run(['codesign', '--force', '--deep', '--sign', '-', out])

    size = subprocess.run(['du', '-sh', out], capture_output=True, text=True).stdout.split()[0]
    print(f'\n完成：{out}  ({size})')
    print(f'启动：open "{out}"   （或双击）')
    print(f'数据目录：~/Library/Application Support/{package.get("profileName", name)}/library/')


if __name__ == '__main__':
    main()
