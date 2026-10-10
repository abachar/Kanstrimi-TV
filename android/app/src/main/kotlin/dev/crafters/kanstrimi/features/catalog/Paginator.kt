package dev.crafters.kanstrimi.features.catalog

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.crafters.kanstrimi.client.CatalogException
import dev.crafters.kanstrimi.contract.Page

/**
 * Holds the loaded pages of a list, the cursor, and preloads when a cell of the last third shows. One per query:
 * the screen makes a new one when the filters change. `key` tells one item from another, a page that repeats one
 * (the list moved under the cursor) adds nothing.
 */
class Paginator<T : Any>(private val key: (T) -> String, private val fetch: suspend (cursor: String?) -> Page<T>) {
    var items: List<T> by mutableStateOf(emptyList())
        private set
    /** `total` of the first page, when the route sends one (the sagas). */
    var total: Int? by mutableStateOf(null)
        private set
    var isLoading: Boolean by mutableStateOf(false)
        private set
    /** Set when the first page failed: the whole grid shows a state panel. */
    var firstPageError: String? by mutableStateOf(null)
        private set
    /** Set when a later page failed: a Retry card takes its place, loaded cards stay. */
    var pageError: String? by mutableStateOf(null)
        private set
    private var loadedOnce by mutableStateOf(false)
    private var nextCursor: String? = null

    val isEmpty: Boolean get() = loadedOnce && items.isEmpty() && firstPageError == null

    suspend fun loadFirstPage() {
        isLoading = true
        firstPageError = null
        pageError = null
        try {
            val page = fetch(null)
            items = page.items
            nextCursor = page.nextCursor
            total = page.total
        } catch (e: CatalogException) {
            firstPageError = e.message
        } finally {
            loadedOnce = true
            isLoading = false
        }
    }

    /** Call when the cell at `index` shows; loads the next page once in the last third. */
    suspend fun loadMoreIfNeeded(index: Int) {
        val cursor = nextCursor ?: return
        if (isLoading || pageError != null || items.isEmpty()) return
        if (index < items.size - maxOf(1, items.size / 3)) return
        loadPage(cursor)
    }

    suspend fun retry() {
        if (firstPageError != null) {
            loadFirstPage()
            return
        }
        pageError = null
        nextCursor?.let { loadPage(it) }
    }

    private suspend fun loadPage(cursor: String) {
        isLoading = true
        try {
            val page = fetch(cursor)
            val known = items.map(key).toSet()
            items = items + page.items.filter { key(it) !in known }
            nextCursor = page.nextCursor
        } catch (e: CatalogException) {
            pageError = e.message
        } finally {
            isLoading = false
        }
    }
}
