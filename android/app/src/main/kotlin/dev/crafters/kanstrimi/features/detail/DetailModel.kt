package dev.crafters.kanstrimi.features.detail

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.crafters.kanstrimi.app.AppEnvironment
import dev.crafters.kanstrimi.client.CatalogException
import dev.crafters.kanstrimi.contract.Card
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.Episode

/** Loads the full card (`GET /movies/{id}` or `GET /series/{id}`, seasons included) and holds what the sheet changes. */
class DetailModel(val id: String, private val env: AppEnvironment) {
    var card: Card? by mutableStateOf(null)
        private set
    var error: String? by mutableStateOf(null)
        private set
    var selectedSeason: Int? by mutableStateOf(null)
    /** Ma liste as the sheet last set it, before the server confirms; null = as the server served it. */
    private var favoriteOverride: Boolean? by mutableStateOf(null)

    val isSeries: Boolean get() = card?.kind == ContentKind.SERIES
    val isFavorite: Boolean get() = favoriteOverride ?: (card?.isFavorite ?: false)

    suspend fun load() {
        error = null
        try {
            val d = env.client.detail(id)
            card = d
            if (d.kind == ContentKind.SERIES && selectedSeason == null) selectedSeason = d.currentEpisode?.season ?: d.seasons?.firstOrNull()?.number
        } catch (e: CatalogException) {
            error = e.message
        }
    }

    /** After a change: the new progress, without moving the season shown nor flashing an error. */
    private suspend fun refresh() {
        try {
            card = env.client.detail(id)
        } catch (_: CatalogException) {
        }
    }

    fun episodes(season: Int): List<Episode> = card?.seasons?.firstOrNull { it.number == season }?.episodes ?: emptyList()

    val currentEpisode: Episode?
        get() {
            val cur = card?.currentEpisode ?: return null
            return episodes(cur.season).firstOrNull { it.number == cur.number }
        }

    /** « Depuis le début » is offered when the main button resumes: the movie, or the current episode. */
    val canRestart: Boolean get() = if (isSeries) currentEpisode?.progress?.resumable == true else card?.progress?.resumable == true

    /** Seen or not: the movie, or one episode; the sheet reloads with the new progress. */
    suspend fun setWatched(target: String = id, watched: Boolean) {
        env.attempt("Marquage") { env.client.setWatched(target, watched) } ?: return
        refresh()
    }

    suspend fun toggleFavorite() {
        val next = !isFavorite
        favoriteOverride = next
        if (env.attempt("Ma liste") { env.client.setFavorite(id, next) } == null) favoriteOverride = !next
    }

    fun play(fromStart: Boolean = false) = env.player.play(id, fromStart = fromStart)
}
