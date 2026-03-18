import type { AuthSession } from "@/server/contracts/auth";
import type { OperationsSnapshot } from "@/server/contracts/operations";

import { getCoordinationSnapshotForSession } from "@/server/platform/coordination";

export async function getOperationsSnapshotForSession(session: AuthSession): Promise<OperationsSnapshot> {
    const snapshot = await getCoordinationSnapshotForSession(session);
    return snapshot.operations;
}
