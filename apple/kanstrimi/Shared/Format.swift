import Foundation

enum Format {
    /// "2 h 07", "48 min".
    static func runtime(minutes: Int) -> String {
        minutes >= 60 ? "\(minutes / 60) h \(String(format: "%02d", minutes % 60))" : "\(minutes) min"
    }
    /// "1:12:48" or "12:48".
    static func clock(_ seconds: TimeInterval) -> String {
        let s = Int(max(0, seconds.rounded()))
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }
    /// "32 min restantes".
    static func remaining(_ seconds: TimeInterval) -> String {
        let m = Int(seconds / 60)
        return m >= 60 ? "\(m / 60) h \(String(format: "%02d", m % 60)) restantes" : "\(max(1, m)) min restantes"
    }
    /// "20:45".
    static func hour(_ date: Date) -> String {
        date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
    }
    /// "25 sept. à 21:14".
    static func dayHour(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated)) + " à " + hour(date)
    }
    /// "il y a 2 min".
    static func ago(_ date: Date) -> String {
        let s = Date.now.timeIntervalSince(date)
        if s < 60 { return "à l'instant" }
        if s < 3600 { return "il y a \(Int(s / 60)) min" }
        if s < 86400 { return "il y a \(Int(s / 3600)) h" }
        return "il y a \(Int(s / 86400)) j"
    }
    /// "35 219".
    static func count(_ n: Int) -> String { n.formatted(.number.grouping(.automatic)) }
}
