"""Render an experiment chart and a traceable Markdown result card."""

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

LABELS = {
    "bm25": ("字符 BM25", "Character BM25", "#8895a6"),
    "easy_only": ("字符排序器 / 普通负例", "Character ranker / Easy negatives", "#9ab4c9"),
    "edit_hard": ("字符排序器 / 修订难负例", "Character ranker / Edit negatives", "#327699"),
    "qwen_easy_only": ("冻结 7B 表征 / 普通负例", "Frozen 7B / Easy negatives", "#d6a578"),
    "qwen_edit_hard": ("冻结 7B 表征 / 修订难负例", "Frozen 7B / Edit negatives", "#9b5034"),
    "llm": ("7B 零样本直接选证据", "7B / Zero-shot choice", "#424a64"),
}


def render_chart(metrics, output):
    test = metrics["benchmark_test"]
    figure, axes = plt.subplots(1, 2, figsize=(10.5, 4.1),
                               gridspec_kw={"width_ratios": [1, 0.82]})
    figure.patch.set_facecolor("#f6f8fb")
    for axis, (numerator, denominator, title) in zip(
        axes,
        (("top1_correct", "queries", "Correct first choice"),
         ("both_correct", "documents", "Both questions correct")),
    ):
        axis.set_facecolor("#f6f8fb")
        methods = list(test)
        values = [test[method][numerator] / test[method][denominator] for method in methods]
        axis.barh(range(len(methods)), values, height=0.52,
                  color=[LABELS[name][2] for name in methods])
        for index, method in enumerate(methods):
            count, total = test[method][numerator], test[method][denominator]
            axis.text(values[index] + 0.025, index, f"{count}/{total}",
                      va="center", fontsize=9, color="#21334a")
        ticks = [LABELS[name][1] for name in methods] if axis is axes[0] else []
        axis.set_yticks(range(len(methods)), labels=ticks if ticks else [""] * len(methods))
        axis.set_xlim(0, 1.14)
        axis.invert_yaxis()
        axis.set_xticks([0, 0.25, 0.5, 0.75, 1], ["0%", "25%", "50%", "75%", "100%"])
        axis.set_axisbelow(True)
        axis.grid(axis="x", color="#dae1ea", linewidth=0.7)
        axis.tick_params(axis="both", length=0, labelsize=8, pad=7)
        for spine in axis.spines.values():
            spine.set_visible(False)
        axis.set_title(title, color="#253550", loc="left", fontsize=11, pad=11)
    figure.suptitle("Finance evidence ranking", color="#162844", fontsize=17,
                    x=0.03, y=0.965, ha="left")
    stats = metrics["splits"]["test"]
    footer = f"Benchmark holdout · {stats['queries']} queries · {stats['documents']} held-out document groups"
    figure.text(0.03, 0.035, footer,
                color="#52657b", fontsize=9)
    figure.subplots_adjust(left=0.265, right=0.98, top=0.81, bottom=0.16, wspace=0.16)
    figure.savefig(output, dpi=180, facecolor=figure.get_facecolor())
    plt.close(figure)


def render_report(metrics, predictions, output):
    lines = [
        "# 从修订中学习金融证据排序 · 实验结果",
        "",
        "模型输入只有问题和候选证据。训练时根据引用替换记录获取正负例。"
        "同一份材料出两道需要不同证据的问题，候选集合和顺序相同。",
        "",
        "| 数据 | 独立文档 | 问题 |",
        "|---|---:|---:|",
    ]
    split_names = {"train": "基准训练集", "validation": "基准验证集",
                   "test": "基准测试集", "source_check": "公开条款核对"}
    for name, entry in metrics["splits"].items():
        lines.append(f"| {split_names[name]} | {entry['documents']} | {entry['queries']} |")
    for key, name in (("benchmark_test", "基准留出集"), ("source_check", "公开条款单案核对")):
        lines.extend(["", f"## {name}", "",
                      "| 方法 | 首选证据正确 | 同文档两问均正确 | 错选改前证据 | MRR |",
                      "|---|---:|---:|---:|---:|"])
        for method, entry in metrics[key].items():
            mrr = "—" if entry["mrr"] is None else f"{entry['mrr']:.3f}"
            lines.append(f"| {LABELS[method][0]} | {entry['top1_correct']}/{entry['queries']} | "
                         f"{entry['both_correct']}/{entry['documents']} | "
                         f"{entry['chose_edited_away_evidence']} | {mrr} |")
    lines.extend(["", "## 训练记录", "",
                  "| 方法 | 训练对 | 验证选定 L2 系数 | 训练目标初值 → 终值 |",
                  "|---|---:|---:|---:|"])
    for method, training in metrics["training"].items():
        best = training["selected"]
        lines.append(f"| {LABELS[method][0]} | {best['training_pairs']} | "
                     f"{best['regularization']:g} | "
                     f"{best['initial_loss']:.4f} → {best['final_loss']:.4f} |")
    lines.extend(["", "## 同文档配对差异", "",
                  "以下是首选命中率的百分点差异。区间以文档为单位配对重采样，"
                  "只反映这组基准文档中的波动。区间为零表示样本中逐文档差异为零。",
                  "", "| 对比 | 变化 | 95% Bootstrap 区间 |", "|---|---:|---:|"])
    for comparison, result in metrics["paired_difference"].items():
        candidate, reference = comparison.split("_vs_")
        lower, upper = result["bootstrap_95_percent"]
        lines.append(f"| {LABELS[candidate][0]} 对 {LABELS[reference][0]} | "
                     f"{result['mean_delta'] * 100:+.1f} | "
                     f"[{lower * 100:+.1f}, {upper * 100:+.1f}] |")
    if "common_regularization_ablation" in metrics:
        comparison = metrics["common_regularization_ablation"]
        easy = comparison["benchmark_test"]["qwen_easy_only"]
        hard = comparison["benchmark_test"]["qwen_edit_hard"]
        lines.extend(["", "## 固定正则系数的补充消融", "",
                      f"在验证集上按两组平均 MRR 共同选定 L2 系数 `{comparison['regularization']:g}`。"
                      f"普通负例的首选命中为 {easy['top1_correct']}/{easy['queries']}，"
                      f"修订难负例为 {hard['top1_correct']}/{hard['queries']}。"])
    lines.extend(["", "## 错例", ""])
    shown = set()
    for method in ("edit_hard", "qwen_edit_hard", "llm"):
        for row in predictions:
            if method not in row["ranks"] or row["id"] in shown or row["split"] != "test":
                continue
            expected = row["edit"]["after"]
            chosen = row["ranks"][method]["order"][0]
            if expected == chosen:
                continue
            evidence = {candidate["id"]: candidate["text"] for candidate in row["candidates"]}
            lines.append(f"- **{row['id']} · {LABELS[method][0]}** — {row['query']} "
                         f"选中「{evidence[chosen]}」；正确证据是「{evidence[expected]}」。")
            shown.add(row["id"])
            break
    lines.extend(["", "逐题结果见 [predictions.json](predictions.json)。"])
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path, nargs="?", default=Path("run"))
    args = parser.parse_args()
    metrics = json.loads((args.run / "metrics.json").read_text(encoding="utf-8"))
    predictions = json.loads((args.run / "predictions.json").read_text(encoding="utf-8"))
    render_chart(metrics, args.run / "results.png")
    render_report(metrics, predictions, args.run / "实验结果.md")
