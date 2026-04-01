import type { DownloadItem } from "../lib/download-types";
import { DownloadItemCard } from "./DownloadItemCard";

interface DownloadListProps {
  items: DownloadItem[];
}

export function DownloadList({ items }: DownloadListProps) {
  return (
    <div className="dl-list">
      {items.map((item) => (
        <DownloadItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
