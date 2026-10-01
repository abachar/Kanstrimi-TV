#if os(iOS)
extension AppEnvironment {
    /// No Top Shelf on iPhone.
    func shareWithTopShelf() {}
    func topShelfDidChange() {}
}
#endif
