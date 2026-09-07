import json
import re
from pathlib import Path

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

plugin = json.loads(Path("plugin.json").read_text(encoding="utf-8"))
mcp = json.loads(Path("mcp.json").read_text(encoding="utf-8"))
codex = json.loads(Path(".codex-plugin/plugin.json").read_text(encoding="utf-8"))
assert plugin["$schema"] == "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
assert plugin["name"] == "centricmem-skill"
assert mcp["$schema"] == "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"
assert mcp["mcpServers"]["centricmem"]["type"] == "streamable-http"
assert mcp["mcpServers"]["centricmem"]["url"] == "https://mem.centricmem.com/mcp"
assert "headers" not in mcp["mcpServers"]["centricmem"]
assert codex["skills"] == "./skills/"
assert codex["mcpServers"] == "./mcp.json"
claude_mp = json.loads(Path(".claude-plugin/marketplace.json").read_text(encoding="utf-8"))
cursor_mp = json.loads(Path(".cursor-plugin/marketplace.json").read_text(encoding="utf-8"))
cursor_pl = json.loads(Path(".cursor-plugin/plugin.json").read_text(encoding="utf-8"))
kiro_mp = json.loads(Path(".kiro/plugins/marketplace.json").read_text(encoding="utf-8"))
assert claude_mp["name"] == "centricmem"
assert claude_mp["plugins"][0]["source"] == "./"
assert cursor_mp["plugins"][0]["source"] == "./"
assert cursor_pl["skills"] == "./skills/"
assert cursor_pl["mcpServers"] == "./mcp.json"
assert kiro_mp["plugins"][0]["source"]["path"] == "./"
codebuddy_mp = json.loads(Path(".codebuddy-plugin/marketplace.json").read_text(encoding="utf-8"))
codebuddy_pl = json.loads(Path(".codebuddy-plugin/plugin.json").read_text(encoding="utf-8"))
kimi_pl = json.loads(Path(".kimi-plugin/plugin.json").read_text(encoding="utf-8"))
kimi_mp = json.loads(Path(".kimi-plugin/marketplace.json").read_text(encoding="utf-8"))
assert codebuddy_mp["name"] == "centricmem"
assert codebuddy_mp["plugins"][0]["source"] == "./"
assert codebuddy_pl["skills"] == "./skills/"
assert codebuddy_pl["mcpServers"] == "./mcp.json"
assert kimi_pl["skills"] == "./skills/"
assert kimi_pl["mcpServers"]["centricmem"]["url"] == "https://mem.centricmem.com/mcp"
assert "headers" not in kimi_pl["mcpServers"]["centricmem"]
assert kimi_mp["plugins"][0]["source"] == "https://github.com/zeyu-j/centricmem-skill"
print("ok", plugin["version"])
