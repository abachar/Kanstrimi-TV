package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.app.AppEnvironment
import dev.crafters.kanstrimi.contract.Channel

/**
 * The player, one service for the whole app, like the Apple app's `PlayerService`: the screens ask it to play, it
 * owns the engine and the player screen. A stub until the player lot lands: every call says so in a notice.
 */
class PlayerService(private val env: AppEnvironment) {
    /** Plays a movie, an episode, or a series (the server resolves the episode to play), from its resume point. */
    fun play(id: String, fromStart: Boolean = false) {
        env.notify("Lecteur : prochain lot")
    }

    /** Plays a channel; `order` is the list it zaps through. */
    fun playChannel(channel: Channel, order: List<Channel>) {
        env.notify("Lecteur : prochain lot")
    }
}
