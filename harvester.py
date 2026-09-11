#!/usr/bin/env python3
"""
harvester.py - Concatenate all files of a given category in the current
directory (recursively) into a single text file, prefixing each file with a
plain-text label containing its path relative to the directory the tool was
run in.

Usage:
    python3 harvester.py <category-key> [-x PATH ...]
    python3 harvester.py --list

Examples:
    python3 harvester.py web
    python3 harvester.py web -x js/config -x js/vendor.js
    python3 harvester.py python -x "tests/**/*.py"

Exclusions (-x, or the "exclude" list of a category in the config) are paths
relative to the current directory. An entry may be a folder (everything under
it is skipped), a single file, or a glob pattern.
"""

import argparse
import fnmatch
import json
import os
import sys

CONFIG_FILENAME = "harvester_config.json"
DEFAULT_OUTPUT = "harvested_code.txt"
DEFAULT_PREFIX = "===== FILE:"


def load_config(config_path):
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        sys.exit(f"Error: configuration file not found: {config_path}")
    except json.JSONDecodeError as e:
        sys.exit(f"Error: configuration file is not valid JSON: {e}")


def get_category(config, key):
    languages = config.get("languages", {})
    lang = languages.get(key)
    if lang is None:
        available = ", ".join(sorted(languages)) or "(none)"
        sys.exit(f"Error: unknown category '{key}'. Available: {available}")
    extensions = lang.get("extensions")
    if not extensions:
        sys.exit(f"Error: category '{key}' has no 'extensions' configured.")
    normalised = []
    for e in extensions:
        e = e.lower()
        if not e.startswith("."):
            e = "." + e
        if e not in normalised:
            normalised.append(e)
    return normalised, list(lang.get("exclude", []))


def normalise_path(p):
    """Make a relative path comparable: forward slashes, no leading './', no trailing '/'."""
    p = p.replace("\\", "/").strip()
    while p.startswith("./"):
        p = p[2:]
    return p.rstrip("/")


def is_excluded(rel_path, exclude_paths):
    """rel_path is a posix-style path relative to root."""
    for pattern in exclude_paths:
        if not pattern:
            continue
        if rel_path == pattern or rel_path.startswith(pattern + "/"):
            return True
        if fnmatch.fnmatch(rel_path, pattern):
            return True
    return False


def collect_files(root, extensions, exclude_dirs, exclude_files, exclude_paths):
    """Return a sorted list of relative (OS-native) paths of matching files."""
    matches = []
    exclude_dirs = set(exclude_dirs)
    for dirpath, dirnames, filenames in os.walk(root):
        kept = []
        for d in sorted(dirnames):
            if d in exclude_dirs:
                continue
            rel_dir = normalise_path(os.path.relpath(os.path.join(dirpath, d), root))
            if is_excluded(rel_dir, exclude_paths):
                continue
            kept.append(d)
        dirnames[:] = kept  # prune in place so os.walk doesn't descend

        for name in sorted(filenames):
            full = os.path.abspath(os.path.join(dirpath, name))
            if full in exclude_files:
                continue
            if os.path.splitext(name)[1].lower() not in extensions:
                continue
            rel = os.path.relpath(full, root)
            if is_excluded(normalise_path(rel), exclude_paths):
                continue
            matches.append(rel)
    return matches


def make_header(rel_path, prefix, suffix):
    rel_path = rel_path.replace(os.sep, "/")
    header = f"{prefix} {rel_path}" if prefix else rel_path
    if suffix:
        header += f" {suffix}"
    return header


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description="Concatenate source files into one text file.",
        epilog=__doc__.split("Exclusions", 1)[1].join(["Exclusions", ""]).strip()
        if "Exclusions" in __doc__ else None,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("category", nargs="?", help="category key from the config")
    parser.add_argument("-x", "--exclude", action="append", default=[], metavar="PATH",
                        help="relative folder, file or glob to exclude (repeatable)")
    parser.add_argument("--list", action="store_true", help="show configured categories")
    return parser.parse_args(argv)


def main(argv):
    args = parse_args(argv)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(script_dir, CONFIG_FILENAME)
    config = load_config(config_path)

    if args.list:
        for key, lang in sorted(config.get("languages", {}).items()):
            line = f"{key}: {', '.join(lang.get('extensions', []))}"
            if lang.get("exclude"):
                line += f"  (excludes: {', '.join(lang['exclude'])})"
            print(line)
        return 0

    if not args.category:
        sys.exit("Error: a category key is required (use --list to see them).")

    extensions, cfg_excludes = get_category(config, args.category)
    prefix = config.get("path_prefix", DEFAULT_PREFIX)
    suffix = config.get("path_suffix", "")

    root = os.getcwd()
    output_name = config.get("output_file", DEFAULT_OUTPUT)
    output_path = os.path.abspath(os.path.join(root, output_name))

    exclude_files = {
        os.path.abspath(__file__),
        os.path.abspath(config_path),
        output_path,
    }
    exclude_dirs = config.get("exclude_dirs", [])
    exclude_paths = [normalise_path(p) for p in cfg_excludes + args.exclude]

    files = collect_files(root, extensions, exclude_dirs, exclude_files, exclude_paths)
    if not files:
        print(f"No files with extensions {', '.join(extensions)} found under {root}.")
        return 1

    with open(output_path, "w", encoding="utf-8") as out:
        for i, rel_path in enumerate(files):
            with open(os.path.join(root, rel_path), "r", encoding="utf-8",
                      errors="replace") as src:
                content = src.read()
            if i > 0:
                out.write("\n\n")
            out.write(make_header(rel_path, prefix, suffix) + "\n")
            out.write(content)
            if not content.endswith("\n"):
                out.write("\n")

    print(f"Harvested {len(files)} file(s) into {output_path}")
    if exclude_paths:
        print(f"Excluded paths: {', '.join(exclude_paths)}")
    for rel_path in files:
        print(f"  {rel_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))