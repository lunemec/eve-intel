#!/usr/bin/env python3
import argparse
import importlib.abc
import importlib.machinery
import importlib.util
import json
import re
import sys
import traceback
from pathlib import Path
from typing import Optional

EXIT_OK = 0
EXIT_BAD_INPUT = 2
EXIT_RUNTIME_ERROR = 3

class InputValidationError(ValueError):
    pass

SECTION_HEADERS = {
    "high slots",
    "high slot",
    "mid slots",
    "mid slot",
    "medium slots",
    "low slots",
    "low slot",
    "rig slots",
    "rig slot",
    "cargo",
    "cargo hold",
    "drones",
    "drone bay",
}


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Compute pyfa text stats for EFT fits via local pyfa source.")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--eft-file", help="Path to EFT text file")
    src.add_argument("--stdin", action="store_true", help="Read EFT from stdin")
    out = parser.add_mutually_exclusive_group()
    out.add_argument("--json-only", action="store_true", help="Print only JSON output")
    out.add_argument("--text-only", action="store_true", help="Print only text summary")
    parser.add_argument("--debug", action="store_true", help="Include debug details on runtime failures")
    return parser.parse_args(argv)


def normalize_eft(eft):
    lines = [line.strip() for line in eft.splitlines()]
    lines = [line for line in lines if line]

    if not lines or not lines[0].startswith("["):
        raise InputValidationError("Invalid EFT fit: expected non-empty fit with bracket header")

    header = lines[0].lstrip("[").rstrip("]")
    parts = [p.strip() for p in header.split(",", 1)]
    ship_name = parts[0]
    fit_name = parts[1] if len(parts) > 1 and parts[1] else "Fit"

    modules = []
    for line in lines[1:]:
        if is_section_header(line):
            continue
        if re.match(r"^\[empty .*slot\]$", line, flags=re.IGNORECASE):
            continue
        modules.append(canonicalize_line(line))

    modules.sort()
    normalized = "\n".join([f"[{ship_name}, {fit_name}]", *modules])
    return {"ship_name": ship_name, "normalized": normalized}


def prepare_direct_eft(eft):
    lines = [line.rstrip() for line in eft.splitlines()]
    non_empty = [line.strip() for line in lines if line.strip()]
    if not non_empty or not non_empty[0].startswith("["):
        raise InputValidationError("Invalid EFT fit: expected non-empty fit with bracket header")
    return "\n".join(lines).strip() + "\n"


def canonicalize_line(line):
    cleaned = re.sub(r"\s+", " ", line).strip()
    return re.sub(r"\s*,\s*", ", ", cleaned)


def is_section_header(line):
    normalized = line.lower().rstrip(":").strip()
    return normalized in SECTION_HEADERS


_PYFA_RUNTIME_READY = False


def run_pyfa_direct_import(normalized_eft):
    _init_pyfa_runtime()
    import_eft = _load_eft_importer()

    fit = import_eft(normalized_eft.splitlines())
    if fit is None:
        raise RuntimeError("pyfa failed to import EFT fit")
    return _stats_from_fit(fit)


def _load_eft_importer():
    import types

    repo_root = Path(__file__).resolve().parents[1]
    port_dir = repo_root / "pyfa" / "service" / "port"
    gui_dir = repo_root / "pyfa" / "gui"
    fit_cmd_dir = gui_dir / "fitCommands"
    eft_path = port_dir / "eft.py"

    if "service.port" not in sys.modules:
        pkg = types.ModuleType("service.port")
        pkg.__path__ = [str(port_dir)]
        sys.modules["service.port"] = pkg
    if "gui" not in sys.modules:
        gui_pkg = types.ModuleType("gui")
        gui_pkg.__path__ = [str(gui_dir)]
        sys.modules["gui"] = gui_pkg
    if "gui.fitCommands" not in sys.modules:
        fit_pkg = types.ModuleType("gui.fitCommands")
        fit_pkg.__path__ = [str(fit_cmd_dir)]
        sys.modules["gui.fitCommands"] = fit_pkg
    if "gui.fitCommands.helpers" not in sys.modules:
        helpers_path = fit_cmd_dir / "helpers.py"
        helpers_spec = importlib.util.spec_from_file_location("gui.fitCommands.helpers", str(helpers_path))
        if helpers_spec is None or helpers_spec.loader is None:
            raise RuntimeError(f"unable to load pyfa helpers module from {helpers_path}")
        helpers_module = importlib.util.module_from_spec(helpers_spec)
        sys.modules["gui.fitCommands.helpers"] = helpers_module
        helpers_spec.loader.exec_module(helpers_module)

    if "service.port.eft" not in sys.modules:
        spec = importlib.util.spec_from_file_location("service.port.eft", str(eft_path))
        if spec is None or spec.loader is None:
            raise RuntimeError(f"unable to load pyfa eft module from {eft_path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules["service.port.eft"] = module
        spec.loader.exec_module(module)

    module = sys.modules["service.port.eft"]
    if not hasattr(module, "importEft"):
        raise RuntimeError("pyfa eft module does not expose importEft")
    return module.importEft


def _init_pyfa_runtime():
    global _PYFA_RUNTIME_READY
    if _PYFA_RUNTIME_READY:
        return

    repo_root = Path(__file__).resolve().parents[1]
    pyfa_root = repo_root / "pyfa"
    if not pyfa_root.exists():
        raise RuntimeError(f"pyfa source directory not found at {pyfa_root}")

    if str(pyfa_root) not in sys.path:
        sys.path.insert(0, str(pyfa_root))

    missing = []
    for mod_name in ("logbook", "sqlalchemy", "yaml", "bs4"):
        try:
            __import__(mod_name)
        except Exception:
            missing.append(mod_name)
    if missing:
        missing_txt = ", ".join(sorted(missing))
        raise RuntimeError(
            "direct pyfa mode is unavailable: missing python dependencies "
            f"({missing_txt}). Install pyfa requirements in your active environment."
        )

    # pyfa imports wx unconditionally in many modules. Install a broad shim for
    # headless CLI mode when wxPython isn't available.
    try:
        __import__("wx")
    except Exception:
        _install_wx_shim()
    _install_pyfa_service_stubs()

    import config as pyfa_config  # pylint: disable=import-error
    from db_update import db_needs_update, update_db  # pylint: disable=import-error

    pyfa_config.saveInRoot = True
    pyfa_config.debug = False
    pyfa_config.loggingLevel = pyfa_config.LOGLEVEL_MAP.get("error")
    pyfa_config.defPaths()
    pyfa_config.defLogging()
    with pyfa_config.logging_setup.threadbound():
        if db_needs_update() is True:
            update_db()
        import eos.db  # pylint: disable=import-error,unused-import
        import eos.events  # pylint: disable=import-error,unused-import
        eos.db.saveddata_meta.create_all()

    _PYFA_RUNTIME_READY = True


def _install_wx_shim():
    import types

    class _Dummy:
        def __call__(self, *args, **kwargs):
            return self

        def __getattr__(self, _name):
            return self

        def __iter__(self):
            return iter(())

        def __bool__(self):
            return False

        def __int__(self):
            return 0

    dummy = _Dummy()

    class _WxLoader(importlib.abc.Loader):
        def create_module(self, spec):
            mod = types.ModuleType(spec.name)
            mod.__dict__.setdefault("__path__", [])
            mod.__dict__.setdefault("__package__", spec.name.rpartition(".")[0])
            mod.__dict__.setdefault("__all__", [])

            def _mod_getattr(name):
                if spec.name == "wx.lib.newevent":
                    if name in ("NewEvent", "NewCommandEvent"):
                        def _new_event_factory(*_args, **_kwargs):
                            class _Evt:  # simple stand-in event class
                                pass
                            return _Evt, object()
                        return _new_event_factory
                if name in ("CommandProcessor",):
                    class _DummyCommandProcessor:
                        def __init__(self):
                            self.Commands = []

                        def Submit(self, command):
                            self.Commands.append(command)
                            return True

                        def Undo(self):
                            if self.Commands:
                                self.Commands.pop()
                                return True
                            return False

                        def ClearCommands(self):
                            self.Commands = []

                    return _DummyCommandProcessor
                if name in ("Colour",):
                    return lambda *args, **kwargs: (0, 0, 0)
                if name.isupper():
                    return 0
                return dummy

            mod.__getattr__ = _mod_getattr
            return mod

        def exec_module(self, module):
            return

    class _WxFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname == "wx" or fullname.startswith("wx."):
                return importlib.machinery.ModuleSpec(fullname, _WxLoader(), is_package=True)
            return None

    has_finder = any(type(f).__name__ == "_WxFinder" for f in sys.meta_path)
    if not has_finder:
        sys.meta_path.insert(0, _WxFinder())

    if "wx" not in sys.modules:
        wx_spec = importlib.machinery.ModuleSpec("wx", _WxLoader(), is_package=True)
        wx_mod = _WxLoader().create_module(wx_spec)
        sys.modules["wx"] = wx_mod


def _install_pyfa_service_stubs():
    import types

    if "service.esi" not in sys.modules:
        esi_mod = types.ModuleType("service.esi")

        class _Esi:
            _instance = None

            @classmethod
            def getInstance(cls):
                if cls._instance is None:
                    cls._instance = cls()
                return cls._instance

            def getSkills(self, *_args, **_kwargs):
                return {"skills": []}

            def getSecStatus(self, *_args, **_kwargs):
                return {"security_status": 0}

        esi_mod.Esi = _Esi
        sys.modules["service.esi"] = esi_mod


def _stats_from_fit(fit):
    _prepare_fit_for_stats(fit)
    offense = {
        "totalDps": as_num(getattr(fit.getTotalDps(), "total", 0)),
        "weaponDps": as_num(getattr(fit.getWeaponDps(), "total", 0)),
        "droneDps": as_num(getattr(fit.getDroneDps(), "total", 0)),
        "totalVolley": as_num(getattr(fit.getTotalVolley(), "total", 0)),
    }

    ehp_map = fit.ehp if getattr(fit, "ehp", None) is not None else {}
    defense = {
        "ehp": {
            "shield": as_num(ehp_map.get("shield", 0)),
            "armor": as_num(ehp_map.get("armor", 0)),
            "hull": as_num(ehp_map.get("hull", 0)),
            "total": as_num(ehp_map.get("shield", 0))
            + as_num(ehp_map.get("armor", 0))
            + as_num(ehp_map.get("hull", 0)),
        },
        "resists": {
            "shield": {
                "em": 1 - as_num(fit.ship.getModifiedItemAttr("shieldEmDamageResonance")),
                "therm": 1 - as_num(fit.ship.getModifiedItemAttr("shieldThermalDamageResonance")),
                "kin": 1 - as_num(fit.ship.getModifiedItemAttr("shieldKineticDamageResonance")),
                "exp": 1 - as_num(fit.ship.getModifiedItemAttr("shieldExplosiveDamageResonance")),
            },
            "armor": {
                "em": 1 - as_num(fit.ship.getModifiedItemAttr("armorEmDamageResonance")),
                "therm": 1 - as_num(fit.ship.getModifiedItemAttr("armorThermalDamageResonance")),
                "kin": 1 - as_num(fit.ship.getModifiedItemAttr("armorKineticDamageResonance")),
                "exp": 1 - as_num(fit.ship.getModifiedItemAttr("armorExplosiveDamageResonance")),
            },
            "hull": {
                "em": 1 - as_num(fit.ship.getModifiedItemAttr("emDamageResonance")),
                "therm": 1 - as_num(fit.ship.getModifiedItemAttr("thermalDamageResonance")),
                "kin": 1 - as_num(fit.ship.getModifiedItemAttr("kineticDamageResonance")),
                "exp": 1 - as_num(fit.ship.getModifiedItemAttr("explosiveDamageResonance")),
            },
        },
    }

    ship_item = getattr(getattr(fit, "ship", None), "item", None)
    misc = {
        "ship": {
            "id": as_num(getattr(ship_item, "ID", 0)),
            "name": getattr(ship_item, "typeName", ""),
        }
    }

    return {"offense": offense, "defense": defense, "misc": misc}


def _prepare_fit_for_stats(fit):
    # Force parity baseline: evaluate with all skills at level 5.
    from eos.saveddata.character import Character as SavedCharacter  # pylint: disable=import-error

    fit.character = SavedCharacter.getAll5()

    # In headless import paths, some entities can miss back-references.
    for mod in list(getattr(fit, "modules", ())):
        if getattr(mod, "owner", None) is None:
            mod.owner = fit
    for drone in list(getattr(fit, "drones", ())):
        if getattr(drone, "item", None) is not None and getattr(drone, "owner", None) is None:
            drone.owner = fit
    for fighter in list(getattr(fit, "fighters", ())):
        if getattr(fighter, "item", None) is not None and getattr(fighter, "owner", None) is None:
            fighter.owner = fit

    # Ensure all derived values are refreshed after character assignment.
    from service.fit import Fit as ServiceFit  # pylint: disable=import-error

    s_fit = ServiceFit.getInstance()
    s_fit.recalc(fit)
    s_fit.fill(fit)


def parse_pyfa_output(stdout):
    parsed = None
    try:
        parsed = json.loads(stdout)
    except Exception:
        tail_json = extract_json_tail(stdout)
        if tail_json is None:
            raise RuntimeError("pyfa output is not valid JSON")
        try:
            parsed = json.loads(tail_json)
        except Exception as exc:
            raise RuntimeError(f"pyfa output is not valid JSON: {exc}") from exc

    return unwrap_svcfitstat_envelope(parsed)


def extract_json_tail(stdout):
    starts = [idx for idx, char in enumerate(stdout) if char == "{"]
    for start in starts:
        candidate = stdout[start:].strip()
        try:
            json.loads(candidate)
            return candidate
        except Exception:
            continue
    return None


def unwrap_svcfitstat_envelope(parsed):
    if isinstance(parsed, dict) and "stats" in parsed:
        if parsed.get("success") is False:
            raise RuntimeError(f"pyfa svcfitstat response failed: {parsed.get('errorText', 'unknown error')}")
        return parsed.get("stats") or {}
    return parsed


def render_text_stats(stats):
    offense = as_dict(stats.get("offense"))
    defense = as_dict(stats.get("defense"))
    misc = as_dict(stats.get("misc"))
    ship = as_dict(misc.get("ship"))
    ehp = as_dict(defense.get("ehp"))
    resists = as_dict(defense.get("resists"))

    lines = []
    ship_name = ship.get("name")
    if ship_name:
        lines.append(f"Ship: {ship_name}")
    lines.append(f"DPS Total: {as_num(offense.get('totalDps')):.2f}")
    lines.append(f"Alpha: {as_num(offense.get('totalVolley')):.2f}")
    lines.append(f"EHP: {as_num(ehp.get('total')):.2f}")

    lines.append(
        "Shield Resists (EM/Therm/Kin/Exp): "
        + format_resists(as_dict(resists.get("shield")))
    )
    lines.append(
        "Armor Resists (EM/Therm/Kin/Exp): "
        + format_resists(as_dict(resists.get("armor")))
    )
    lines.append(
        "Hull Resists (EM/Therm/Kin/Exp): "
        + format_resists(as_dict(resists.get("hull")))
    )

    max_speed = misc.get("maxSpeed")
    if max_speed is not None:
        lines.append(f"Max Speed: {as_num(max_speed):.2f} m/s")

    capacitor = as_dict(misc.get("capacitor"))
    if capacitor:
        stable = capacitor.get("stable")
        if stable is True:
            lines.append("Capacitor: Stable")
        elif stable is False:
            lasts = capacitor.get("lastsSeconds")
            if lasts is not None:
                lines.append(f"Capacitor: Unstable ({as_num(lasts):.2f}s)")
            else:
                lines.append("Capacitor: Unstable")

    targeting = as_dict(misc.get("targeting"))
    if targeting.get("range") is not None:
        lines.append(f"Targeting Range: {as_num(targeting.get('range')):.2f} m")

    return "\n".join(lines)


def format_resists(res):
    em = as_num(res.get("em")) * 100
    therm = as_num(res.get("therm")) * 100
    kin = as_num(res.get("kin")) * 100
    exp = as_num(res.get("exp")) * 100
    return f"{em:.2f}%/{therm:.2f}%/{kin:.2f}%/{exp:.2f}%"


def as_dict(value):
    return value if isinstance(value, dict) else {}


def as_num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def tail(text, limit):
    return text[-limit:] if text else ""


def main(argv=None, stdin_data=None, out=None, err=None):
    out = out or sys.stdout
    err = err or sys.stderr
    args = None
    try:
        args = parse_args(argv)

        if args.eft_file:
            try:
                eft = open(args.eft_file, "r", encoding="utf-8").read()
            except OSError as exc:
                raise InputValidationError(f"cannot read EFT file: {exc}") from exc
        else:
            eft = stdin_data if stdin_data is not None else sys.stdin.read()

        prepared = prepare_direct_eft(eft)
        stats = run_pyfa_direct_import(prepared)

        if not args.json_only:
            print(render_text_stats(as_dict(stats)), file=out)
        if not args.text_only:
            if not args.json_only:
                print("", file=out)
            print(json.dumps(stats, indent=2, sort_keys=True), file=out)
        return EXIT_OK
    except SystemExit:
        return EXIT_BAD_INPUT
    except InputValidationError as exc:
        print(f"Input error: {exc}", file=err)
        return EXIT_BAD_INPUT
    except Exception as exc:
        print(f"Runtime error: {exc}", file=err)
        if args and args.debug:
            print(f"Debug type: {type(exc).__name__}", file=err)
            traceback.print_exc(file=err)
        return EXIT_RUNTIME_ERROR


if __name__ == "__main__":
    raise SystemExit(main())
