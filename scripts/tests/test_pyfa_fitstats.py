import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import pyfa_fitstats as mod


def test_reject_empty_eft():
    with pytest.raises(ValueError, match="Invalid EFT fit"):
        mod.normalize_eft(" \n \n")


def test_reject_missing_header():
    with pytest.raises(ValueError, match="Invalid EFT fit"):
        mod.normalize_eft("Damage Control II")


def test_normalize_eft_deterministic():
    eft = """[Nergal, Test]

    High Slots:
    [Empty High slot]
    B Module
    A   Module
    Cargo:
    Nanite Repair Paste x100
    """
    normalized = mod.normalize_eft(eft)
    assert normalized["ship_name"] == "Nergal"
    assert normalized["normalized"] == "[Nergal, Test]\nA Module\nB Module\nNanite Repair Paste x100"


def test_parse_raw_pyfa_json():
    parsed = mod.parse_pyfa_output(
        json.dumps(
            {
                "offense": {"totalDps": 123.4, "totalVolley": 250.5},
                "defense": {
                    "ehp": {"total": 9999},
                    "resists": {
                        "shield": {"em": 0.1, "therm": 0.2, "kin": 0.3, "exp": 0.4},
                        "armor": {"em": 0.5, "therm": 0.6, "kin": 0.7, "exp": 0.8},
                        "hull": {"em": 0.9, "therm": 0.9, "kin": 0.9, "exp": 0.9},
                    },
                },
            }
        )
    )
    assert parsed["offense"]["totalDps"] == 123.4
    assert parsed["defense"]["ehp"]["total"] == 9999


def test_parse_svcfitstat_envelope():
    parsed = mod.parse_pyfa_output(
        json.dumps(
            {
                "success": True,
                "stats": {
                    "offense": {"totalDps": 77.7, "totalVolley": 123.4},
                    "defense": {
                        "ehp": {"total": 4321.9},
                        "resists": {
                            "shield": {"em": 0.1, "therm": 0.2, "kin": 0.3, "exp": 0.4},
                            "armor": {"em": 0.5, "therm": 0.6, "kin": 0.7, "exp": 0.8},
                            "hull": {"em": 0.9, "therm": 0.9, "kin": 0.9, "exp": 0.9},
                        },
                    },
                },
            }
        )
    )
    assert parsed["offense"]["totalDps"] == 77.7
    assert parsed["defense"]["ehp"]["total"] == 4321.9


def test_fail_on_non_json_stdout():
    with pytest.raises(RuntimeError, match="valid JSON"):
        mod.parse_pyfa_output("not-json")


def test_render_text_contains_core_fields():
    stats = {
        "offense": {"totalDps": 398.48, "totalVolley": 584.67},
        "defense": {
            "ehp": {"total": 9507.26},
            "resists": {
                "shield": {"em": 0.075, "therm": 0.5375, "kin": 0.445, "exp": 0.8612},
                "armor": {"em": 0.736, "therm": 0.868, "kin": 0.7561, "exp": 0.8152},
                "hull": {"em": 0.598, "therm": 0.598, "kin": 0.598, "exp": 0.598},
            },
        },
        "misc": {"ship": {"name": "Nergal"}},
    }
    out = mod.render_text_stats(stats)
    assert "Ship: Nergal" in out
    assert "DPS Total: 398.48" in out
    assert "Alpha: 584.67" in out
    assert "EHP: 9507.26" in out
    assert "Shield Resists" in out
    assert "Armor Resists" in out
    assert "Hull Resists" in out


def test_exit_code_input_error_when_both_sources():
    code = mod.main(["--stdin", "--eft-file", "x.eft"], stdin_data="[A, B]\n")
    assert code == mod.EXIT_BAD_INPUT


def test_exit_code_runtime_error_when_direct_import_fails(monkeypatch, tmp_path):
    fit_file = tmp_path / "fit.eft"
    fit_file.write_text("[Nergal, Test]\nDamage Control II\n", encoding="utf8")

    def fake_direct_import(_eft):
        raise RuntimeError("boom")

    monkeypatch.setattr(mod, "run_pyfa_direct_import", fake_direct_import)
    code = mod.main(["--eft-file", str(fit_file), "--text-only"])
    assert code == mod.EXIT_RUNTIME_ERROR
