import { useMemo, useRef, useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { diffLines, type Change } from "diff";

/* ── Public helpers ── */

export interface DiffViewProps {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
  leftExists: boolean;
  rightExists: boolean;
}

export function hasContentDiff(left: string, right: string, leftExists: boolean, rightExists: boolean): boolean {
  if (!leftExists && !rightExists) return false;
  if (leftExists !== rightExists) return true;
  return left !== right;
}

/* ── Internal types ── */

interface DiffLine {
  lineNo: number | null;
  text: string;
  type: "equal" | "added" | "removed" | "empty";
}

interface DiffRow {
  left: DiffLine;
  right: DiffLine;
}

interface ChangeRegion {
  startRow: number;
  endRow: number; // exclusive
}

interface Segment {
  text: string;
  highlight: boolean;
}

/* ── Diff computation ── */

function buildRows(changes: Change[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let leftLine = 1;
  let rightLine = 1;

  for (const change of changes) {
    if (change.value === "") continue;
    const lines = change.value.replace(/\n$/, "").split("\n");

    if (!change.added && !change.removed) {
      for (const text of lines) {
        rows.push({
          left: { lineNo: leftLine++, text, type: "equal" },
          right: { lineNo: rightLine++, text, type: "equal" },
        });
      }
    } else if (change.removed) {
      for (const text of lines) {
        rows.push({
          left: { lineNo: leftLine++, text, type: "removed" },
          right: { lineNo: null, text: "", type: "empty" },
        });
      }
    } else if (change.added) {
      const addedLines = lines;
      const unpaired: number[] = [];
      let scan = rows.length - 1;
      while (scan >= 0 && rows[scan].left.type === "removed" && rows[scan].right.type === "empty") {
        unpaired.unshift(scan);
        scan--;
      }
      let ai = 0;
      for (const idx of unpaired) {
        if (ai < addedLines.length) {
          rows[idx].right = { lineNo: rightLine++, text: addedLines[ai], type: "added" };
          ai++;
        }
      }
      for (; ai < addedLines.length; ai++) {
        rows.push({
          left: { lineNo: null, text: "", type: "empty" },
          right: { lineNo: rightLine++, text: addedLines[ai], type: "added" },
        });
      }
    }
  }
  return rows;
}

function collectChangeRegions(rows: DiffRow[]): ChangeRegion[] {
  const regions: ChangeRegion[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].left.type !== "equal" || rows[i].right.type !== "equal") {
      const start = i;
      while (i < rows.length && (rows[i].left.type !== "equal" || rows[i].right.type !== "equal")) i++;
      regions.push({ startRow: start, endRow: i });
    } else {
      i++;
    }
  }
  return regions;
}

/* ── Character-level diff ── */

function charDiff(oldText: string, newText: string): { oldSegments: Segment[]; newSegments: Segment[] } {
  const oLen = oldText.length;
  const nLen = newText.length;
  if (oLen === 0) return { oldSegments: [], newSegments: [{ text: newText, highlight: true }] };
  if (nLen === 0) return { oldSegments: [{ text: oldText, highlight: true }], newSegments: [] };

  let prefixLen = 0;
  while (prefixLen < oLen && prefixLen < nLen && oldText[prefixLen] === newText[prefixLen]) prefixLen++;
  let suffixLen = 0;
  while (suffixLen < oLen - prefixLen && suffixLen < nLen - prefixLen && oldText[oLen - 1 - suffixLen] === newText[nLen - 1 - suffixLen]) suffixLen++;

  const prefix = oldText.slice(0, prefixLen);
  const oldMid = oldText.slice(prefixLen, oLen - suffixLen);
  const newMid = newText.slice(prefixLen, nLen - suffixLen);
  const suffix = oldText.slice(oLen - suffixLen);

  const oldSegs: Segment[] = [];
  const newSegs: Segment[] = [];
  if (prefix) { oldSegs.push({ text: prefix, highlight: false }); newSegs.push({ text: prefix, highlight: false }); }
  if (oldMid) oldSegs.push({ text: oldMid, highlight: true });
  if (newMid) newSegs.push({ text: newMid, highlight: true });
  if (suffix) { oldSegs.push({ text: suffix, highlight: false }); newSegs.push({ text: suffix, highlight: false }); }
  if (oldSegs.length === 0) oldSegs.push({ text: oldText, highlight: false });
  if (newSegs.length === 0) newSegs.push({ text: newText, highlight: false });
  return { oldSegments: oldSegs, newSegments: newSegs };
}

function SegmentedLine({ segments, type }: { segments: Segment[]; type: "removed" | "added" }) {
  return (
    <>
      {segments.map((seg, i) => (
        <span key={i} className={seg.highlight ? `diff-char diff-char--${type}` : undefined}>{seg.text}</span>
      ))}
    </>
  );
}

/* ── Connector SVG ── */

const CONNECTOR_WIDTH = 48;

function ConnectorCanvas({
  regions,
  leftTableRef,
  rightTableRef,
  scrollRef,
  contentHeight,
}: {
  regions: ChangeRegion[];
  leftTableRef: React.RefObject<HTMLTableElement | null>;
  rightTableRef: React.RefObject<HTMLTableElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  contentHeight: number;
}) {
  const [paths, setPaths] = useState<string[]>([]);

  // 仅在布局变化时计算路径，避免每次渲染都读 DOM
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    const leftRows = leftTableRef.current?.querySelectorAll("tr");
    const rightRows = rightTableRef.current?.querySelectorAll("tr");

    if (!scrollEl || !leftRows || !rightRows || regions.length === 0) {
      setPaths([]);
      return;
    }

    const containerTop = scrollEl.getBoundingClientRect().top;
    const st = scrollEl.scrollTop;
    const next: string[] = [];

    for (const region of regions) {
      const lFirst = leftRows[region.startRow] as HTMLElement | undefined;
      const lLast = leftRows[region.endRow - 1] as HTMLElement | undefined;
      const rFirst = rightRows[region.startRow] as HTMLElement | undefined;
      const rLast = rightRows[region.endRow - 1] as HTMLElement | undefined;
      if (!lFirst || !lLast || !rFirst || !rLast) continue;

      const ly1 = lFirst.getBoundingClientRect().top - containerTop + st;
      const ly2 = lLast.getBoundingClientRect().bottom - containerTop + st;
      const ry1 = rFirst.getBoundingClientRect().top - containerTop + st;
      const ry2 = rLast.getBoundingClientRect().bottom - containerTop + st;

      const cp = CONNECTOR_WIDTH * 0.5;
      next.push(
        `M 0,${ly1} C ${cp},${ly1} ${CONNECTOR_WIDTH - cp},${ry1} ${CONNECTOR_WIDTH},${ry1} ` +
        `L ${CONNECTOR_WIDTH},${ry2} C ${CONNECTOR_WIDTH - cp},${ry2} ${cp},${ly2} 0,${ly2} Z`
      );
    }

    setPaths(next);
  }, [regions, contentHeight]);

  return (
    <svg
      className="diff-connector__svg"
      width={CONNECTOR_WIDTH}
      height={contentHeight}
      viewBox={`0 0 ${CONNECTOR_WIDTH} ${contentHeight}`}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} className="diff-connector__path" />
      ))}
    </svg>
  );
}

/* ── Main DiffView ── */

export function DiffView({ left, right, leftLabel, rightLabel, leftExists, rightExists }: DiffViewProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const leftTableRef = useRef<HTMLTableElement>(null);
  const rightTableRef = useRef<HTMLTableElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  const { rows, regions } = useMemo(() => {
    if (!leftExists && !rightExists) return { rows: [] as DiffRow[], regions: [] as ChangeRegion[] };
    const l = leftExists ? left : "";
    const r = rightExists ? right : "";
    const changes = diffLines(l, r);
    const builtRows = buildRows(changes);
    return { rows: builtRows, regions: collectChangeRegions(builtRows) };
  }, [left, right, leftExists, rightExists]);

  const hasChanges = rows.some((r) => r.left.type !== "equal");

  // Measure content height after layout
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setContentHeight(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);

  if (!leftExists && !rightExists) {
    return <div className="diff-empty">{t("diff.bothMissing")}</div>;
  }

  return (
    <div className="diff-view">
      {!hasChanges && (
        <div className="diff-identical">{t("diff.noChanges")}</div>
      )}

      {/* Column headers */}
      <div className="diff-header">
        <div className="diff-header__label diff-header__label--left">{leftLabel}</div>
        <div className="diff-header__connector" />
        <div className="diff-header__label diff-header__label--right">{rightLabel}</div>
      </div>

      {/* Scrollable body — single scrollbar */}
      <div className="diff-body" ref={scrollRef}>
        {/* Left table */}
        <div className="diff-panel diff-panel--left">
          {!leftExists ? (
            <div className="diff-panel__missing">{t("diff.fileNotExist")}</div>
          ) : (
            <table className="diff-table" ref={leftTableRef}>
              <tbody>
                {rows.map((row, i) => {
                  const paired = row.left.type === "removed" && row.right.type === "added";
                  const chars = paired ? charDiff(row.left.text, row.right.text) : null;
                  return (
                    <tr key={i} className={`diff-row diff-row--${row.left.type}`}>
                      <td className="diff-gutter">{row.left.lineNo ?? ""}</td>
                      <td className="diff-code">
                        {row.left.type === "empty" ? (
                          <span className="diff-code__empty" />
                        ) : chars ? (
                          <SegmentedLine segments={chars.oldSegments} type="removed" />
                        ) : (
                          row.left.text
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Center connector */}
        <div className="diff-connector">
          <ConnectorCanvas
            regions={regions}
            leftTableRef={leftTableRef}
            rightTableRef={rightTableRef}
            scrollRef={scrollRef}
            contentHeight={contentHeight}
          />
        </div>

        {/* Right table */}
        <div className="diff-panel diff-panel--right">
          {!rightExists ? (
            <div className="diff-panel__missing">{t("diff.fileNotExist")}</div>
          ) : (
            <table className="diff-table" ref={rightTableRef}>
              <tbody>
                {rows.map((row, i) => {
                  const paired = row.left.type === "removed" && row.right.type === "added";
                  const chars = paired ? charDiff(row.left.text, row.right.text) : null;
                  return (
                    <tr key={i} className={`diff-row diff-row--${row.right.type}`}>
                      <td className="diff-gutter">{row.right.lineNo ?? ""}</td>
                      <td className="diff-code">
                        {row.right.type === "empty" ? (
                          <span className="diff-code__empty" />
                        ) : chars ? (
                          <SegmentedLine segments={chars.newSegments} type="added" />
                        ) : (
                          row.right.text
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
