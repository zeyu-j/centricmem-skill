import json
import re
from pathlib import Path

ROOT = Path(".")
FORBIDDEN_DIRS = {
    "src",
    "dist",
    "tests",
    "desktop",
    "web",
    "scripts",
    "scenarios",
    "templates",
    ".centricmem",
    ".cursor",
}
FORBIDDEN_FILES = {
    "PRODUCT.md",
    "PRODUCT_HOST.md",
    "ARCHITECTURE.md",
    "BETA.md",
    "SYNC.md",
    "IMPORT_BUNDLE.md",
    "ACADEMIC_DB_REPORT.md",
    "TEST_RESULTS.md",
    "TEST_NOTES.md",
    "manager.json",
}
PRIVATE_LEAKS = (
    "reasonix",
    "icegreen",
    r"c:\\src\\centricmem",
    r"d:\\centricmem",
    r"e:\\centricmem",
)
MCP_URL = "https://mem.centricmem.com/mcp"

skill = Path("skills/centricmem-agent/SKILL.md").read_text(encoding="utf-8").replace("\r\n", "\n")
readme = Path("README.md").read_text(encoding="utf-8").replace("\r\n", "\n")
assert re.search(r"^name: centricmem-agent", skill, re.M)
assert re.search(r"^description:", skill, re.M)
assert re.search(r"^license:", skill, re.M)
assert re.search(r"^compatibility:", skill, re.M)
assert re.search(r"^metadata:", skill, re.M)
if re.search(r"^(version|compatible_cli|changelog_url):", skill, re.M):
    raise SystemExit("Agent Skills extra keys must live under metadata:")
assert "npx --yes skills add zeyu-j/centricmem-skill" in readme
assert "/plugin marketplace add zeyu-j/centricmem-skill" in readme
assert "cm_delete" in skill and "{file" in skill and "shelf" in skill
for line in skill.splitlines():
    m = re.search(r"curl\s+", line, re.I)
    if m and re.search(r"https?://", line[m.start() :]):
        raise SystemExit("HOL RISKY_SKILL_INSTRUCTION: curl before https URL on the same SKILL.md line")

for name in FORBIDDEN_DIRS:
    if (ROOT / name).is_dir():
        raise SystemExit(f"client tree must not ship: {name}/")
for name in FORBIDDEN_FILES:
    if (ROOT / name).is_file():
        raise SystemExit(f"private file must not ship: {name}")
if (ROOT / "skills/academic-db-agent").is_dir():
    raise SystemExit("private skill extras must not ship")
if (ROOT / "skills/centricmem-agent/integrations").is_dir():
    raise SystemExit("private skill extras must not ship")
if (ROOT / "skills/centricmem-agent/ACADEMIC.md").is_file():
    raise SystemExit("private skill extras must not ship")

pkg = json.loads(Path("package.json").read_text(encoding="utf-8"))
version = pkg["version"]
assert pkg["name"] == "centricmem-skill"
assert "bin" not in pkg
lock = json.loads(Path("package-lock.json").read_text(encoding="utf-8"))
assert lock["name"] == "centricmem-skill"
assert lock["version"] == version
assert lock["packages"][""]["version"] == version

manifest_paths = [
    Path("plugin.json"),
    Path(".codex-plugin/plugin.json"),
    Path(".claude-plugin/plugin.json"),
    Path(".cursor-plugin/plugin.json"),
    Path(".codebuddy-plugin/plugin.json"),
    Path(".workbuddy-plugin/plugin.json"),
    Path(".kimi-plugin/plugin.json"),
    Path(".grok-plugin/plugin.json"),
]
for path in manifest_paths:
    data = json.loads(path.read_text(encoding="utf-8"))
    got = data.get("version")
    if got and got != version:
        raise SystemExit(f"{path} version {got} != {version}")

plugin = json.loads(Path("plugin.json").read_text(encoding="utf-8"))
mcp = json.loads(Path("mcp.json").read_text(encoding="utf-8"))
codex = json.loads(Path(".codex-plugin/plugin.json").read_text(encoding="utf-8"))
assert plugin["$schema"] == "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
assert plugin["name"] == "centricmem-skill"
assert plugin["version"] == version
assert mcp["$schema"] == "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"
centric = mcp["mcpServers"]["centricmem"]
assert centric["type"] == "streamable-http"
assert centric["url"] == MCP_URL
assert "headers" not in centric
assert "env" not in centric
assert codex["skills"] == "./skills/"
assert codex["mcpServers"] == "./mcp.json"

claude_mp = json.loads(Path(".claude-plugin/marketplace.json").read_text(encoding="utf-8"))
cursor_mp = json.loads(Path(".cursor-plugin/marketplace.json").read_text(encoding="utf-8"))
cursor_pl = json.loads(Path(".cursor-plugin/plugin.json").read_text(encoding="utf-8"))
kiro_mp = json.loads(Path(".kiro/plugins/marketplace.json").read_text(encoding="utf-8"))
assert claude_mp["name"] == "centricmem"
assert claude_mp["plugins"][0]["source"] == "./"
assert claude_mp["plugins"][0]["version"] == version
assert claude_mp["metadata"]["version"] == version
assert cursor_mp["plugins"][0]["source"] == "./"
assert cursor_pl["skills"] == "./skills/"
assert cursor_pl["mcpServers"] == "./mcp.json"
assert kiro_mp["plugins"][0]["source"]["path"] == "./"
codebuddy_mp = json.loads(Path(".codebuddy-plugin/marketplace.json").read_text(encoding="utf-8"))
codebuddy_pl = json.loads(Path(".codebuddy-plugin/plugin.json").read_text(encoding="utf-8"))
workbuddy_mp = json.loads(Path(".workbuddy-plugin/marketplace.json").read_text(encoding="utf-8"))
kimi_pl = json.loads(Path(".kimi-plugin/plugin.json").read_text(encoding="utf-8"))
kimi_mp = json.loads(Path(".kimi-plugin/marketplace.json").read_text(encoding="utf-8"))
github_mp = json.loads(Path(".github/plugin/marketplace.json").read_text(encoding="utf-8"))
agents_mp = json.loads(Path(".agents/plugins/marketplace.json").read_text(encoding="utf-8"))
assert codebuddy_mp["name"] == "centricmem"
assert codebuddy_mp["plugins"][0]["source"] == "./"
assert codebuddy_mp["plugins"][0]["version"] == version
assert workbuddy_mp["plugins"][0]["version"] == version
assert codebuddy_pl["skills"] == "./skills/"
assert codebuddy_pl["mcpServers"] == "./mcp.json"
assert kimi_pl["skills"] == "./skills/"
assert kimi_pl["mcpServers"]["centricmem"]["url"] == MCP_URL
assert "headers" not in kimi_pl["mcpServers"]["centricmem"]
assert kimi_mp["plugins"][0]["source"] == "https://github.com/zeyu-j/centricmem-skill"
assert github_mp["plugins"][0]["version"] == version
assert agents_mp["plugins"][0]["source"]["path"] == "./"
assert Path("assets/icon.svg").is_file()
assert Path("skills/centricmem-agent/REFERENCE.md").is_file()
assert Path(".github/workflows/hol-plugin-scanner.yml").is_file()
hol = Path(".github/workflows/hol-plugin-scanner.yml").read_text(encoding="utf-8")
if "hashgraph-online/ai-plugin-scanner-action@" not in hol or re.search(
    r"hashgraph-online/ai-plugin-scanner-action@v\d", hol
):
    raise SystemExit("HOL scanner must stay SHA-pinned")

blob = "\n".join(
    p.read_text(encoding="utf-8", errors="ignore").lower()
    for p in [
        Path("README.md"),
        Path("CHANGELOG.md"),
        Path("skills/centricmem-agent/SKILL.md"),
        Path("skills/centricmem-agent/REFERENCE.md"),
    ]
)
for leak in PRIVATE_LEAKS:
    if re.search(leak, blob, re.I):
        raise SystemExit(f"private leak in public copy: {leak}")

print("ok", version)
