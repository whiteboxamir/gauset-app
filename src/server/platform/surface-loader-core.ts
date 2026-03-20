export function resolveStudioScopedSnapshot<T>({
    enabled = true,
    hasActiveStudio,
    loader,
    fallback,
}: {
    enabled?: boolean;
    hasActiveStudio: boolean;
    loader: () => Promise<T>;
    fallback: T;
}) {
    if (!enabled || !hasActiveStudio) {
        return Promise.resolve(fallback);
    }

    return loader();
}
