export type AmbientSoundId = "ocean" | "night" | "campfire" | "rain"

export interface AmbientSoundDefinition {
  id: AmbientSoundId
  label: string
  emoji: string
  url: string
}

export const AMBIENT_SOUNDS: AmbientSoundDefinition[] = [
  { id: "ocean", label: "Ocean", emoji: "🌊", url: "/sounds/ocean.mp3" },
  { id: "night", label: "Night", emoji: "🌙", url: "/sounds/night.mp3" },
  { id: "campfire", label: "Fire", emoji: "🔥", url: "/sounds/campfire.mp3" },
  { id: "rain", label: "Rain", emoji: "🌧", url: "/sounds/rain.mp3" },
]

type SoundStatus = "idle" | "loading" | "ready" | "error"

class LoopingSound {
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private readonly gainNode: GainNode
  private status: SoundStatus = "idle"

  constructor(
    private readonly context: AudioContext,
    private readonly url: string,
  ) {
    this.gainNode = this.context.createGain()
    this.gainNode.gain.value = 0.6
    this.gainNode.connect(this.context.destination)
  }

  getStatus() {
    return this.status
  }

  async load() {
    if (this.status === "ready") {
      return true
    }

    if (this.status === "loading") {
      return false
    }

    this.status = "loading"

    try {
      const response = await fetch(this.url)
      if (!response.ok) {
        throw new Error(`Failed to load ${this.url}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      this.buffer = await this.context.decodeAudioData(arrayBuffer)
      this.status = "ready"
      return true
    } catch (error) {
      console.warn(`[sounds] unable to load ${this.url}`, error)
      this.status = "error"
      return false
    }
  }

  async play() {
    if (this.context.state === "suspended") {
      await this.context.resume()
    }

    if (this.source) {
      return this.status === "ready"
    }

    if (!this.buffer) {
      const loaded = await this.load()
      if (!loaded || !this.buffer) {
        return false
      }
    }

    const source = this.context.createBufferSource()
    source.buffer = this.buffer
    source.loop = true
    source.connect(this.gainNode)
    source.start()
    source.onended = () => {
      if (this.source === source) {
        this.source = null
      }
    }
    this.source = source
    return true
  }

  stop() {
    this.source?.stop()
    this.source?.disconnect()
    this.source = null
  }

  setVolume(volume: number) {
    this.gainNode.gain.setTargetAtTime(volume, this.context.currentTime, 0.1)
  }
}

export class AmbientSoundEngine {
  private context: AudioContext | null = null
  private sounds = new Map<AmbientSoundId, LoopingSound>()

  private ensureContext() {
    if (this.context) {
      return this.context
    }

    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) {
      throw new Error("Web Audio API is not supported in this browser")
    }

    this.context = new AudioContextCtor()
    return this.context
  }

  private getSound(id: AmbientSoundId) {
    const existing = this.sounds.get(id)
    if (existing) {
      return existing
    }

    const definition = AMBIENT_SOUNDS.find((sound) => sound.id === id)
    if (!definition) {
      throw new Error(`Unknown ambient sound: ${id}`)
    }

    const sound = new LoopingSound(this.ensureContext(), definition.url)
    this.sounds.set(id, sound)
    return sound
  }

  async load(id: AmbientSoundId) {
    return this.getSound(id).load()
  }

  async play(id: AmbientSoundId) {
    return this.getSound(id).play()
  }

  stop(id: AmbientSoundId) {
    this.getSound(id).stop()
  }

  setVolume(id: AmbientSoundId, volume: number) {
    this.getSound(id).setVolume(volume)
  }

  getStatus(id: AmbientSoundId): SoundStatus {
    return this.getSound(id).getStatus()
  }

  destroy() {
    this.sounds.forEach((sound) => sound.stop())
    this.sounds.clear()
    void this.context?.close()
    this.context = null
  }
}
