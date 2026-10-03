"""Prepare a separate Slovo example from an Apktool-decoded original.

No owner endpoint is part of this script. The previous default is discovered
from the original, removed, and its presence in the output is rejected.
"""
import argparse
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit

ANDROID = '{http://schemas.android.com/apk/res/android}'
ET.register_namespace('android', 'http://schemas.android.com/apk/res/android')


def protect_authenticated_https(api_file: Path):
    content = api_file.read_text(encoding='utf-8')
    guard_start = '''
    invoke-static {p1}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v0
    invoke-virtual {v0}, Landroid/net/Uri;->getScheme()Ljava/lang/String;
    move-result-object v1
    const-string v2, "https"
    invoke-virtual {v2, v1}, Ljava/lang/String;->equalsIgnoreCase(Ljava/lang/String;)Z
    move-result v1
    if-eqz v1, :allow_scheme_fallback
    invoke-virtual {v0}, Landroid/net/Uri;->getEncodedPath()Ljava/lang/String;
    move-result-object v0
    if-eqz v0, :allow_scheme_fallback
    const-string v1, "/access/"
    invoke-virtual {v0, v1}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z
    move-result v0
    if-eqz v0, :allow_scheme_fallback
'''
    cases = [
        ('alternateScheme(Ljava/lang/String;)Ljava/lang/String;', '    .locals 5\n',
         '    const/4 v0, 0x0\n    return-object v0\n'),
        ('schemeCandidates(Ljava/lang/String;)Ljava/util/List;',
         '    invoke-virtual {p1}, Ljava/lang/Object;->toString()Ljava/lang/String;\n\n    move-result-object p1\n',
         '    invoke-static {p1}, Lm4/l;->D(Ljava/lang/Object;)Ljava/util/List;\n    move-result-object v0\n    return-object v0\n'),
    ]
    for name, insertion, result in cases:
        start = content.index('.method private final ' + name)
        end = content.index('.end method', start)
        method = content[start:end]
        if ':allow_scheme_fallback' in method:
            guard_start_index = method.index('    invoke-static {p1}, Landroid/net/Uri;->parse')
            guard_end_index = method.index('    :allow_scheme_fallback\n', guard_start_index) + len('    :allow_scheme_fallback\n')
            method = method[:guard_start_index] + method[guard_end_index:]
        if '    .locals 5' not in method or insertion not in method:
            raise ValueError('Unexpected scheme-fallback register layout')
        guard = guard_start + result + '    :allow_scheme_fallback\n'
        method = method.replace(insertion, insertion + guard, 1)
        content = content[:start] + method + content[end:]
    api_file.write_text(content, encoding='utf-8')


def protect_authenticated_redirects(root: Path):
    file = root / 'smali/j4/a.smali'
    content = file.read_text(encoding='utf-8')
    start = content.index('.method public a(Le4/A;LJ/D;)LA0/b;')
    end = content.index('.end method', start)
    method = content[start:end]
    if ':allow_example_redirect' in method:
        return
    marker = '    :cond_12\n'
    if '    .locals 10' not in method or method.count(marker) != 1:
        raise ValueError('Unexpected OkHttp redirect layout')
    guard = '''
    iget-object v8, v2, LA0/b;->b:Ljava/lang/Object;
    check-cast v8, Le4/q;
    iget-object v8, v8, Le4/q;->h:Ljava/lang/String;
    iget-object v9, v1, Le4/q;->h:Ljava/lang/String;
    invoke-static {v8, v9}, Lapp/lampac/slovo/example/TransportPolicy;->allowRedirect(Ljava/lang/String;Ljava/lang/String;)Z
    move-result v8
    if-nez v8, :allow_example_redirect
    return-object v0
    :allow_example_redirect
'''
    method = method.replace(marker, marker + guard, 1)
    file.write_text(content[:start] + method + content[end:], encoding='utf-8')


def patch(root: Path):
    smali = root / 'smali/app/lampac/slovo'
    local = (smali / 'data/LocalStore.smali').read_text(encoding='utf-8')
    getter = re.search(r'\.method public final getServerUrl\(\)Ljava/lang/String;(.*?)\.end method', local, re.S)
    if not getter:
        raise ValueError('Original LocalStore.getServerUrl signature was not found')
    defaults = re.findall(r'const-string \w+, "(https?://[^"\n]+)"', getter.group(1))
    if len(defaults) != 1:
        raise ValueError('Expected one original default URL')
    previous = defaults[0]
    previous_host = urlsplit(previous).hostname

    for file in smali.rglob('*.smali'):
        content = file.read_text(encoding='utf-8')
        if previous in content:
            file.write_text(content.replace(previous, ''), encoding='utf-8')

    dns_file = smali / 'data/ResilientDns.smali'
    dns = dns_file.read_text(encoding='utf-8')
    start = dns.index('    const-string ', dns.index('->lastKnown:'))
    end = dns.index('    sput-object ', start)
    replacement = '    new-instance v0, Ljava/util/HashMap;\n\n    invoke-direct {v0}, Ljava/util/HashMap;-><init>()V\n\n'
    dns_file.write_text(dns[:start] + replacement + dns[end:], encoding='utf-8')
    protect_authenticated_https(smali / 'data/ApiClient.smali')
    protect_authenticated_redirects(root)

    manifest_file = root / 'AndroidManifest.xml'
    manifest = ET.parse(manifest_file)
    node = manifest.getroot()
    original_package = node.attrib['package']
    package = original_package + '.example'
    node.set('package', package)
    for element in node.iter():
        for name in [ANDROID + 'name', ANDROID + 'authorities']:
            value = element.get(name, '')
            if value.startswith(original_package + '.') and ('DYNAMIC_RECEIVER' in value or name.endswith('authorities')):
                element.set(name, value.replace(original_package, package, 1))
    application = node.find('application')
    application.set(ANDROID + 'allowBackup', 'false')
    activity = application.find('activity')
    activity.set(ANDROID + 'exported', 'false')
    filters = list(activity.findall('intent-filter'))
    for intent_filter in filters:
        activity.remove(intent_filter)
    launcher = ET.SubElement(application, 'activity', {
        ANDROID + 'name': 'app.lampac.slovo.example.ServerSetupActivity',
        ANDROID + 'exported': 'true',
        ANDROID + 'windowSoftInputMode': 'adjustResize',
    })
    for intent_filter in filters:
        launcher.append(intent_filter)
    manifest.write(manifest_file, encoding='utf-8', xml_declaration=True)

    strings_file = root / 'res/values/strings.xml'
    strings = ET.parse(strings_file)
    for item in strings.getroot():
        if item.get('name') == 'app_name':
            item.text = 'СЛОво · свой сервер (пример)'
    strings.write(strings_file, encoding='utf-8', xml_declaration=True)
    security = root / 'res/xml/network_security_config.xml'
    security.write_text('<?xml version="1.0" encoding="utf-8"?>\n<network-security-config><base-config cleartextTrafficPermitted="true" /></network-security-config>\n', encoding='utf-8')

    config_file = root / 'apktool.yml'
    config = config_file.read_text(encoding='utf-8')
    config = re.sub(r'versionCode: \d+', 'versionCode: 24', config)
    config = re.sub(r'versionName: [^\n]+', 'versionName: 1.8.10-own-server-example', config)
    config_file.write_text(config, encoding='utf-8')
    build_config = smali / 'BuildConfig.smali'
    build_config.write_text(build_config.read_text(encoding='utf-8').replace('"' + original_package + '"', '"' + package + '"'), encoding='utf-8')
    target = smali / 'example'
    target.mkdir(exist_ok=True)
    shutil.copyfile(Path(__file__).with_name('ServerSetupActivity.smali'), target / 'ServerSetupActivity.smali')
    shutil.copyfile(Path(__file__).with_name('TransportPolicy.smali'), target / 'TransportPolicy.smali')

    for file in list((root / 'smali').rglob('*.smali')) + list((root / 'res').rglob('*.xml')):
        content = file.read_text(encoding='utf-8')
        if previous in content or (previous_host and previous_host in content):
            raise ValueError('Previous endpoint remains in ' + file.name)
    print('Prepared separate own-server example with empty fallback and required first-run setup.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('decoded', type=Path)
    patch(parser.parse_args().decoded)
