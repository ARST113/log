"""Execute the compiled scheme-fallback method with small Android/String stubs.

Requires Androguard. This checks DEX branch behavior without starting Android;
it does not replace a device test of setup, search, and playback.
"""
import argparse
import zipfile
from urllib.parse import urlsplit

from loguru import logger
from androguard.core.dex import DEX

logger.remove()


class CharSequenceValue(str):
    """Retain q0's declared type until the actual DEX toString conversion."""


def method_from_apk(path, method_name, class_name='Lapp/lampac/slovo/data/ApiClient;'):
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if name.endswith('.dex'):
                dex = DEX(archive.read(name))
                for cls in dex.get_classes():
                    if cls.get_name() == class_name:
                        for method in cls.get_methods():
                            if method.get_name() == method_name:
                                return method
    raise AssertionError('ApiClient.' + method_name + ' was not found')


def execute(method, url, redirect=None):
    code = method.get_code()
    registers = {code.get_registers_size() - 1: url}
    if redirect is not None:
        registers[code.get_registers_size() - 2] = url
        registers[code.get_registers_size() - 1] = redirect
    instructions = {}
    offset = 0
    for instruction in code.get_bc().get_instructions():
        instructions[offset] = instruction
        offset += instruction.get_length()
    pc, result = 0, None
    for _ in range(200):
        instruction = instructions[pc]
        name = instruction.get_name()
        operands = instruction.get_operands()
        args = [registers.get(item[1], 0) for item in operands if item[0] == 0]
        next_pc = pc + instruction.get_length()
        if name == 'const-string':
            registers[operands[0][1]] = operands[-1][2]
        elif name in ('const/4', 'const/16'):
            registers[operands[0][1]] = operands[-1][1]
        elif name.startswith('move-result'):
            registers[operands[0][1]] = result
        elif name.startswith('invoke-'):
            target = operands[-1][2]
            if target.startswith('Landroid/net/Uri;->parse('):
                assert type(args[0]) is str, 'Uri.parse requires String; q0 CharSequence must first pass toString'
                result = urlsplit(args[0])
            elif target.startswith('Landroid/net/Uri;->getScheme('):
                result = args[0].scheme
            elif target.startswith('Landroid/net/Uri;->getEncodedPath('):
                result = args[0].path
            elif '->equalsIgnoreCase(' in target:
                result = str(args[0]).lower() == str(args[1]).lower()
            elif '->contains(' in target:
                result = args[1] in args[0]
            elif target.startswith('LU3/q;->U('):
                result = args[0].lower().startswith(args[1].lower()) if args[2] else args[0].startswith(args[1])
            elif target.startswith('LU3/j;->q0('):
                result = CharSequenceValue(args[0].strip())
            elif target.startswith('Ljava/lang/Object;->toString('):
                result = str(args[0])
            elif target.startswith('Lm4/l;->D('):
                result = [args[0]]
            elif target.startswith('LB3/q;->S('):
                result = list(args[0])
            elif '->substring(' in target:
                result = args[0][args[1]:]
            elif '->concat(' in target:
                result = args[0] + args[1]
            elif target.startswith('Lkotlin/jvm/internal/l;->e('):
                assert args[0] is not None
            else:
                raise AssertionError('Unsupported invocation: ' + target)
        elif name == 'if-eqz':
            if not args[0]:
                next_pc = pc + operands[-1][1] * 2
        elif name == 'if-nez':
            if args[0]:
                next_pc = pc + operands[-1][1] * 2
        elif name.startswith('goto'):
            next_pc = pc + operands[-1][1] * 2
        elif name == 'filled-new-array':
            result = list(args)
        elif name == 'sget-object' and operands[-1][2].startswith('LB3/x;->l'):
            registers[operands[0][1]] = []
        elif name == 'return-object':
            return None if args[0] == 0 else args[0]
        elif name == 'return':
            return bool(args[0])
        else:
            raise AssertionError('Unsupported instruction: ' + name)
        pc = next_pc
    raise AssertionError('Method did not return')


def check(path):
    method = method_from_apk(path, 'alternateScheme')
    cases = [
        ('https://own.example/access/demo/audio/play/1/0', None),
        ('HTTPS://own.example/access/demo/audiobooks/audio', None),
        ('https://own.example/base/access/demo/audiobooks/img', None),
        ('https://audio.example/chapter.mp3', 'http://audio.example/chapter.mp3'),
        ('https://audio.example/chapter.mp3?url=https%3A%2F%2Fown.example%2Faccess%2Fdemo',
         'http://audio.example/chapter.mp3?url=https%3A%2F%2Fown.example%2Faccess%2Fdemo'),
        ('http://own.example/access/demo/audio/play/1/0', 'https://own.example/access/demo/audio/play/1/0'),
        ('file:///access/demo/chapter.mp3', None),
        ('https://own.example/accessory/demo', 'http://own.example/accessory/demo'),
    ]
    for url, expected in cases:
        actual = execute(method, url)
        assert actual == expected, (url, actual, expected)
    images = method_from_apk(path, 'schemeCandidates')
    for url, alternate in cases:
        if alternate is not None:
            expected = [alternate, url] if url.startswith('http://') else [url, alternate]
        else:
            expected = [url] if url.lower().startswith('https://') else []
        actual = execute(images, url)
        assert actual == expected, ('image scheme candidates', url, actual, expected)
    url = 'https://own.example/access/demo/audiobooks/img'
    assert execute(images, '  ' + url + '  ') == [url], 'trimmed authenticated image retains HTTPS only'
    policy = method_from_apk(path, 'allowRedirect', 'Lapp/lampac/slovo/example/TransportPolicy;')
    redirects = [
        ('https://own.example/access/demo/audio', 'http://own.example/access/demo/audio', False),
        ('https://own.example/access/demo/audio', 'https://own.example/access/demo/audio2', True),
        ('https://own.example/access/demo/audio', 'http://audio.example/chapter.mp3', True),
        ('http://own.example/access/demo/audio', 'http://own.example/access/demo/audio2', True),
        ('HTTPS://own.example/access/demo/audio', 'HTTP://own.example/access/demo/audio2', False),
        ('https://own.example/access/demo/audio', 'http://audio.example/?url=https%3A%2F%2Fown.example%2Faccess%2Fdemo', True),
        ('https://own.example/access/demo/audio', 'http://own.example/base/access/demo/audio', False),
    ]
    for origin, target, expected in redirects:
        assert execute(policy, origin, target) == expected, (origin, target, expected)
    followup = method_from_apk(path, 'a', 'Lj4/a;')
    instructions = list(followup.get_code().get_bc().get_instructions())
    calls = [index for index, item in enumerate(instructions) if 'TransportPolicy;->allowRedirect' in item.get_output()]
    assert len(calls) == 1, 'shared OkHttp redirect follow-up must invoke the policy'
    next_ops = [item.get_name() for item in instructions[calls[0] + 1:calls[0] + 4]]
    assert next_ops == ['move-result', 'if-nez', 'return-object'], 'denied redirect must stop before HTTP follow-up'
    print('PASS: 24 compiled DEX audio/image/redirect cases; HTTPS access URLs are never downgraded.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('apk')
    check(parser.parse_args().apk)
