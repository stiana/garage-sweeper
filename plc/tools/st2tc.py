#!/usr/bin/env python3
"""Converts readable .st sources in plc/src into TwinCAT 3 object files.

TwinCAT keeps each POU in its own XML file (.TcPOU, .TcIO, .TcDUT, .TcGVL).
Writing those by hand is noisy, so the framework is written as plain ST here
and converted. Add the generated files to the PLC project in XAE with
"Add > Existing Item". After that XAE owns them; edit them there.

Source layout, one object per file:
  FUNCTION_BLOCK / PROGRAM ...   declaration up to the first marker below
  // @body                       optional body of the POU
  METHOD Name : Type             method declaration (VAR blocks follow)
  // @impl                       method implementation, until END_METHOD
  PROPERTY Name : Type           property, with GET ... END_GET and/or SET ... END_SET,
  END_PROPERTY                   ending with END_PROPERTY
Interfaces list METHOD headers with their VAR blocks, and PROPERTY lines
followed by GET and/or SET on their own lines.

GUIDs are derived from the object and member names, so regenerating gives
the same ids.
"""
import sys
import uuid
from pathlib import Path
from xml.sax.saxutils import quoteattr

PRODUCT_VERSION = "3.1.4026.12"
NAMESPACE = uuid.UUID("6f1c2b7e-3d4a-4c8b-9e2f-5a6b7c8d9e0f")


def guid(*parts: str) -> str:
    return "{" + str(uuid.uuid5(NAMESPACE, "/".join(parts))) + "}"


def cdata(text: str) -> str:
    return "<![CDATA[" + text.strip("\n") + "]]>"


def wrap(kind: str, name: str, inner: str, extra: str = "") -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        f'<TcPlcObject Version="1.1.0.1" ProductVersion="{PRODUCT_VERSION}">\n'
        f'  <{kind} Name={quoteattr(name)} Id="{guid(name)}"{extra}>\n'
        f"{inner}"
        f"  </{kind}>\n"
        "</TcPlcObject>\n"
    )


def split_members(lines, interface=False):
    """Splits a POU source into header, body, and member blocks."""
    header, body, members = [], [], []
    current = header
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped == "// @body":
            current = body
        elif stripped.startswith("METHOD ") and not line.startswith((" ", "\t")):
            block = [line]
            i += 1
            while i < len(lines) and lines[i].strip() != "END_METHOD" and not (interface and starts_member(lines[i])):
                block.append(lines[i])
                i += 1
            members.append(("method", block))
            if interface and i < len(lines) and starts_member(lines[i]):
                continue
            current = None
        elif stripped.startswith("PROPERTY ") and not line.startswith((" ", "\t")):
            block = [line]
            i += 1
            while i < len(lines) and lines[i].strip() != "END_PROPERTY" and not (interface and starts_member(lines[i])):
                block.append(lines[i])
                i += 1
            members.append(("property", block))
            if interface and i < len(lines) and starts_member(lines[i]):
                continue
            current = None
        elif current is not None:
            current.append(line)
        i += 1
    return header, body, members


def starts_member(line: str) -> bool:
    return line.startswith(("METHOD ", "PROPERTY "))


def member_name(line: str) -> str:
    rest = line.split(None, 1)[1]
    for prefix in ("PUBLIC ", "PRIVATE ", "PROTECTED ", "INTERNAL ", "FINAL ", "ABSTRACT "):
        rest = rest.replace(prefix, "")
    return rest.split(":")[0].strip().split()[0]


def method_xml(owner: str, block, with_impl: bool) -> str:
    name = member_name(block[0])
    if "// @impl" in [l.strip() for l in block]:
        index = [l.strip() for l in block].index("// @impl")
        declaration, impl = block[:index], block[index + 1:]
    else:
        declaration, impl = block, []
    out = f'    <Method Name="{name}" Id="{guid(owner, name)}">\n'
    out += f"      <Declaration>{cdata(chr(10).join(declaration))}</Declaration>\n"
    if with_impl:
        out += f"      <Implementation>\n        <ST>{cdata(chr(10).join(impl))}</ST>\n      </Implementation>\n"
    out += "    </Method>\n"
    return out


def accessor_blocks(block):
    accessors = {}
    current = None
    for line in block[1:]:
        s = line.strip()
        if s in ("GET", "SET"):
            current = s
            accessors[current] = []
        elif s in ("END_GET", "END_SET"):
            current = None
        elif current:
            accessors[current].append(line)
    return accessors


def property_xml(owner: str, block, with_impl: bool) -> str:
    name = member_name(block[0])
    out = f'    <Property Name="{name}" Id="{guid(owner, name)}">\n'
    out += f"      <Declaration>{cdata(block[0])}</Declaration>\n"
    for accessor, lines in accessor_blocks(block).items():
        label = "Get" if accessor == "GET" else "Set"
        out += f'      <{label} Name="{label}" Id="{guid(owner, name, label)}">\n'
        if with_impl:
            decl, code = split_declaration(lines)
            out += f"        <Declaration>{cdata(chr(10).join(decl) or 'VAR' + chr(10) + 'END_VAR')}</Declaration>\n"
            out += f"        <Implementation>\n          <ST>{cdata(chr(10).join(code))}</ST>\n        </Implementation>\n"
        else:
            out += "        <Declaration><![CDATA[]]></Declaration>\n"
        out += f"      </{label}>\n"
    out += "    </Property>\n"
    return out


def split_declaration(lines):
    """Separates leading VAR ... END_VAR blocks from the code that follows."""
    decl, code = [], []
    inside = False
    for line in lines:
        s = line.strip()
        if not code and (inside or s.startswith("VAR")):
            decl.append(line)
            inside = s != "END_VAR"
        else:
            code.append(line)
    return decl, code


def convert(path: Path, out_dir: Path) -> Path:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    first = next(l for l in lines if l.strip() and not l.strip().startswith(("{", "//")))
    keyword = first.split()[0]
    name = path.stem
    if keyword == "TYPE":
        xml = wrap("DUT", name, f"    <Declaration>{cdata(text)}</Declaration>\n")
        target = out_dir / f"{name}.TcDUT"
    elif keyword in ("VAR_GLOBAL",):
        xml = wrap("GVL", name, f"    <Declaration>{cdata(text)}</Declaration>\n")
        target = out_dir / f"{name}.TcGVL"
    elif keyword == "INTERFACE":
        header, _, members = split_members(lines, interface=True)
        inner = f"    <Declaration>{cdata(chr(10).join(header))}</Declaration>\n"
        for kind, block in members:
            inner += method_xml(name, block, False) if kind == "method" else property_xml(name, block, False)
        xml = wrap("Itf", name, inner)
        target = out_dir / f"{name}.TcIO"
    else:
        header, body, members = split_members(lines)
        inner = f"    <Declaration>{cdata(chr(10).join(header))}</Declaration>\n"
        inner += f"    <Implementation>\n      <ST>{cdata(chr(10).join(body))}</ST>\n    </Implementation>\n"
        for kind, block in members:
            inner += method_xml(name, block, True) if kind == "method" else property_xml(name, block, True)
        xml = wrap("POU", name, inner, ' SpecialFunc="None"')
        target = out_dir / f"{name}.TcPOU"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(xml, encoding="utf-8")
    return target


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    source_dir = root / "src"
    out_root = root / "generated"
    count = 0
    for path in sorted(source_dir.rglob("*.st")):
        convert(path, out_root / path.parent.relative_to(source_dir))
        count += 1
    print(f"Wrote {count} TwinCAT objects to {out_root}")


if __name__ == "__main__":
    sys.exit(main())
