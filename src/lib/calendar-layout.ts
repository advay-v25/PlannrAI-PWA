
import { differenceInMinutes } from 'date-fns';

export interface LayoutBlock {
    id: string;
    start: Date;
    end: Date;
    top: number; // pixels
    height: number; // pixels
    colIndex: number; // 0-based index
    totalCols: number; // total columns in this overlap group
}

/**
 * Calculates the visual layout for a set of schedule blocks.
 * Groups overlapping blocks and assigns them horizontal columns.
 */
export function calculateLayout(blocks: any[], cellHeight: number = 60): Map<string, LayoutBlock> {
    const layoutMap = new Map<string, LayoutBlock>();
    const sorted = [...blocks].sort((a, b) =>
        new Date(`2000-01-01T${a.start_time}`).getTime() - new Date(`2000-01-01T${b.start_time}`).getTime()
    );

    // Group into overlapping clusters
    const clusters: any[][] = [];
    let currentCluster: any[] = [];

    for (const block of sorted) {
        if (currentCluster.length === 0) {
            currentCluster.push(block);
            continue;
        }

        const blockStart = new Date(`2000-01-01T${block.start_time}`);
        const clusterEnd = new Date(Math.max(...currentCluster.map(b => new Date(`2000-01-01T${b.end_time}`).getTime())));

        // If this block starts before the current cluster ends, add it to the cluster
        if (blockStart < clusterEnd) {
            currentCluster.push(block);
        } else {
            // Close current cluster and start new one
            clusters.push(currentCluster);
            currentCluster = [block];
        }
    }
    if (currentCluster.length > 0) clusters.push(currentCluster);

    // Process each cluster
    for (const cluster of clusters) {
        // Determine columns within cluster
        // Simple greedy coloring algorithm
        const columns: any[][] = [];

        for (const block of cluster) {
            let placed = false;
            const blockStart = new Date(`2000-01-01T${block.start_time}`);

            for (let i = 0; i < columns.length; i++) {
                const col = columns[i];
                const lastInCol = col[col.length - 1];
                const lastEnd = new Date(`2000-01-01T${lastInCol.end_time}`);

                if (blockStart >= lastEnd) {
                    col.push(block);
                    placed = true;
                    layoutMap.set(block.id, {
                        ...calculateVertical2(block, cellHeight),
                        colIndex: i,
                        totalCols: 1 // placeholder, updated later
                    });
                    break;
                }
            }

            if (!placed) {
                columns.push([block]);
                layoutMap.set(block.id, {
                    ...calculateVertical2(block, cellHeight),
                    colIndex: columns.length - 1,
                    totalCols: 1
                });
            }
        }

        // Update totalCols for all blocks in this cluster
        const clusterWidth = columns.length;
        for (const block of cluster) {
            const layout = layoutMap.get(block.id);
            if (layout) {
                layout.totalCols = clusterWidth;
                // Optimization: Expand if space available? 
                // For now, keep it simple: equal width columns.
                // Later: "Liquid" expansion finding gaps.
            }
        }
    }

    return layoutMap;
}

function calculateVertical2(block: any, cellHeight: number) {
    const start = new Date(`2000-01-01T${block.start_time}`);
    const end = new Date(`2000-01-01T${block.end_time}`);
    let startMinutes = start.getHours() * 60 + start.getMinutes();
    let duration = differenceInMinutes(end, start);
    if (duration < 15) duration = 15;

    const top = (startMinutes / 60) * cellHeight;
    const height = (duration / 60) * cellHeight;

    return { id: block.id, start, end, top, height };
}
