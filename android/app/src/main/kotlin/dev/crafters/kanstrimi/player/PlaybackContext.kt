package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.contract.Card
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.Episode
import dev.crafters.kanstrimi.contract.EpisodeRef
import dev.crafters.kanstrimi.contract.NextEpisode
import dev.crafters.kanstrimi.contract.Person
import dev.crafters.kanstrimi.contract.Playback
import dev.crafters.kanstrimi.contract.RememberedVersion
import dev.crafters.kanstrimi.contract.Version

/** `tmdb:tv:1396:s01e05` → `tmdb:tv:1396`; null when this is not an episode id. */
fun seriesIdOf(id: String): String? {
    val match = Regex(":s\\d{2,}e\\d{2,}$").find(id) ?: return null
    return id.substring(0, match.range.first)
}

/** Who plays: a movie, an episode (its series' name in `subtitle`), a channel (its programme). */
data class PlaybackContent(
    val id: String,
    val kind: ContentKind,
    val title: String,
    val subtitle: String? = null,
    val episode: EpisodeRef? = null,
    val backdrop: String? = null,
)

/** What the app hands the player: who it is, plus the playback the server gave (`/playback/{id}`). */
data class PlaybackContext(
    val content: PlaybackContent,
    val versions: List<Version>,
    val resumeAt: Double? = null,
    val duration: Double? = null,
    val next: NextEpisode? = null,
    val cast: List<Person> = emptyList(),
    /** The version the profile chose for the title (the series' for an episode), as the server served it. */
    val remembered: RememberedVersion? = null,
) {
    constructor(content: PlaybackContent, playback: Playback) :
        this(content, playback.versions, playback.resumeAt, playback.duration, playback.next, playback.cast, playback.remembered)

    val isLive: Boolean get() = content.kind == ContentKind.LIVE
    /** The series of an episode, for the per-series language choice. */
    val seriesId: String? get() = if (content.kind == ContentKind.EPISODE) seriesIdOf(content.id) else null
    /** The title a chosen version is kept under: the series for an episode, the title itself otherwise. */
    val rememberId: String get() = seriesId ?: content.id

    /** The same title from `position` (null: from the start), everything else kept. */
    fun resuming(at: Double?): PlaybackContext = copy(resumeAt = at)

    companion object {
        /** A sheet: a movie as itself, a series through the episode the server resumes it on. */
        fun of(card: Card, playback: Playback): PlaybackContext {
            val content = playback.episode?.let {
                PlaybackContent(it.id, ContentKind.EPISODE, it.title ?: card.title, card.title, EpisodeRef(it.season, it.number, it.title), card.backdrop)
            } ?: PlaybackContent(card.id, if (card.kind == ContentKind.OTHER) ContentKind.MOVIE else card.kind, card.title, null, null, card.backdrop)
            return PlaybackContext(content, playback)
        }

        fun of(episode: Episode, series: Card, playback: Playback): PlaybackContext =
            PlaybackContext(PlaybackContent(episode.id, ContentKind.EPISODE, episode.title, series.title, EpisodeRef(episode.season, episode.number, episode.title), series.backdrop), playback)

        /** A list item: a movie as itself, a series through the episode `/playback/{series}` resolved. */
        fun of(item: ContentItem, playback: Playback): PlaybackContext {
            val content = playback.episode?.let {
                PlaybackContent(it.id, ContentKind.EPISODE, it.title ?: item.title, item.title, EpisodeRef(it.season, it.number, it.title), item.picture)
            } ?: PlaybackContent(item.id, if (item.kind == ContentKind.SERIES || item.kind == ContentKind.OTHER) ContentKind.MOVIE else item.kind, item.title, null, null, item.picture)
            return PlaybackContext(content, playback)
        }

        /** The next episode announced by `/playback`, its own playback asked. */
        fun of(next: NextEpisode, after: PlaybackContext, playback: Playback): PlaybackContext =
            PlaybackContext(PlaybackContent(next.id, ContentKind.EPISODE, next.title ?: "", after.content.subtitle, EpisodeRef(next.season, next.number, next.title), after.content.backdrop), playback)
    }
}
