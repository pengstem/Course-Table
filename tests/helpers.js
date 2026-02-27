export function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

export function assertEqual(actual, expected, message) {
    if (actual !== expected)
        throw new Error(`${message} (expected=${expected}, actual=${actual})`);
}
