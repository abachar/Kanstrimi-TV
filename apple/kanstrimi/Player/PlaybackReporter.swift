import Foundation

/// Sends what is watched: the position of a film or an episode, the time spent on a channel. A position that
/// cannot reach the server waits in the `ProgressQueue`, replayed after the next one that does.
final class PlaybackReporter {
    private let client: CatalogClient
    private let queue: ProgressQueue

    init(client: CatalogClient, queue: ProgressQueue) {
        self.client = client
        self.queue = queue
    }

    func report(_ report: ProgressReport) async {
        do {
            try await client.report(report)
            // An older position of the same title, queued while offline, must not replay over this one.
            queue.drop(report.contentID)
            await queue.flush { [client] in try await client.report($0) }
        } catch CatalogError.notFound {
            // The title left the catalogue: nothing to keep.
        } catch CatalogError.unauthorized {
            // The device was unpaired: its progress is gone with it.
        } catch {
            queue.enqueue(report)
        }
    }

    /// « Chaînes les plus regardées »: lost when offline, a channel's minutes are not worth a queue.
    func reportWatchTime(id: ContentID, seconds: Int) async {
        try? await client.reportWatchTime(id: id, seconds: seconds)
    }
}
