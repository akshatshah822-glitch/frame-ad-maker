import styles from "./class-room.module.css";

// The tutor's board slides, drawn in the chat as infographics: a still from the lecture, flowchart, cards,
// compare, mind map (hub), timeline, table, steps, bars or a counter.
export type BoardSlide = { narration: string; title: string; visual: string; visualData: string };

const items = (data: string) => data.split("|").map((item) => item.trim()).filter(Boolean);
// "Label: value". Splits at the first ": " (colon + space) so times like "5:38: Groundwater falls" stay whole.
const pair = (item: string) => {
  const spaced = item.indexOf(": ");
  const split = spaced >= 0 ? spaced : item.indexOf(":");
  return split < 0 ? { label: item, value: "" } : { label: item.slice(0, split).trim(), value: item.slice(split + 1).trim() };
};
const delay = (index: number) => ({ animationDelay: `${index * 120}ms` });
const momentSeconds = (moment: string) => {
  const [minutes, seconds] = moment.trim().split(":").map(Number);
  return seconds === undefined ? minutes : minutes * 60 + seconds;
};

function Visual({ slide, classId, onSeek }: { slide: BoardSlide; classId: string; onSeek?: (at: number) => void }) {
  const data = slide.visualData;
  switch (slide.visual) {
    case "frame": {
      const [moment, ...rest] = data.split("=");
      const at = momentSeconds(moment ?? "");
      if (!Number.isFinite(at)) return null;
      const caption = rest.join("=").trim();
      return <figure className={styles.frame}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a still from this class's own lecture video */}
        <img src={`/api/class/${classId}/frame?t=${Math.floor(at)}`} alt={caption || `The lecture at ${moment.trim()}`} loading="lazy" />
        <figcaption>{onSeek ? <button type="button" onClick={() => onSeek(at)}>▶ {moment.trim()}</button> : <span>{moment.trim()}</span>}{caption}</figcaption>
      </figure>;
    }
    case "flowchart": {
      const steps = data.split(/>|→/).map((step) => step.trim()).filter(Boolean);
      return <ol className={styles.flow} aria-label="Flowchart">{steps.map((step, index) => <li key={index} style={delay(index)}><span>{index + 1}</span>{step}</li>)}</ol>;
    }
    case "cards":
      return <div className={styles.cards}>{items(data).map(pair).map((card, index) => <div key={index} style={delay(index)}><strong>{card.label}</strong>{card.value ? <span>{card.value}</span> : null}</div>)}</div>;
    case "compare":
      return <div className={styles.compare} aria-label="Comparison">{items(data).slice(0, 2).map(pair).map((side, index) => <div key={index} style={delay(index)}>
        <strong>{side.label}</strong>
        <ul>{side.value.split(";").map((point) => point.trim()).filter(Boolean).map((point, i) => <li key={i}>{point}</li>)}</ul>
      </div>)}<b aria-hidden="true">vs</b></div>;
    case "hub": {
      const [centre, ...parts] = items(data);
      return <div className={styles.hub} aria-label="Mind map">
        <strong>{centre}</strong>
        <ul>{parts.map(pair).map((part, index) => <li key={index} style={delay(index + 1)}><b>{part.label}</b>{part.value ? <span>{part.value}</span> : null}</li>)}</ul>
      </div>;
    }
    case "timeline":
      return <ol className={styles.timeline} aria-label="Timeline">{items(data).map(pair).map((event, index) => <li key={index} style={delay(index)}><b>{event.label}</b><span>{event.value}</span></li>)}</ol>;
    case "stairs":
      return <ol className={styles.stairs} aria-label="Steps">{items(data).map(pair).map((stage, index, all) => <li key={index} style={{ ...delay(index), marginLeft: `${(index / Math.max(1, all.length - 1)) * 28}%` }}><b>{stage.label}</b>{stage.value ? <span>{stage.value}</span> : null}</li>)}</ol>;
    case "table": {
      const [header, ...rows] = items(data).map(pair);
      if (!header) return null;
      return <table className={styles.table}><thead><tr><th>{header.label}</th><th>{header.value}</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}><td>{row.label}</td><td>{row.value}</td></tr>)}</tbody></table>;
    }
    case "bar": {
      const bars = items(data).map(pair).map((bar) => ({ ...bar, amount: Number.parseFloat(bar.value.replace(/[^\d.]/g, "")) || 0 }));
      const max = Math.max(...bars.map((bar) => bar.amount), 1);
      return <div className={styles.bars} aria-label="Bar chart">{bars.map((bar, index) => <div key={index}><span>{bar.label}</span><i style={{ width: `${Math.max(4, (bar.amount / max) * 100)}%`, ...delay(index) }} /><b>{bar.value}</b></div>)}</div>;
    }
    case "counter":
      return data ? <p className={styles.counter}>{data}</p> : null;
    default:
      return null;
  }
}

export function DoubtBoards({ slides, classId, onSeek }: { slides: BoardSlide[]; classId: string; onSeek?: (at: number) => void }) {
  if (!slides.length) return null;
  // The lecture picture leads, so the student first sees where this idea came from.
  const ordered = [...slides.filter((slide) => slide.visual === "frame"), ...slides.filter((slide) => slide.visual !== "frame")];
  return <ol className={styles.boards} aria-label="On the board">
    {ordered.map((slide, index) => <li key={index} data-visual={slide.visual}>
      <em>{slide.visual === "frame" ? "From the lecture" : `Board ${index + (ordered[0]?.visual === "frame" ? 0 : 1)}`}</em>
      <strong>{slide.title}</strong>
      <Visual slide={slide} classId={classId} onSeek={onSeek} />
      <p>{slide.narration}</p>
    </li>)}
  </ol>;
}
