#if os(tvOS)
/// tvOS: the player is always on screen while it plays, there is no Now Playing card to feed.
final class NowPlaying {
    func attach(to service: PlayerService) { }
    func update() { }
    func clear() { }
}
#endif
