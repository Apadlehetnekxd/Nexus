"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Send, ImageIcon, MessageSquare, Sparkles, Loader2, Instagram, Volume2, VolumeX, Mic, MicOff } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Message {
  role: "user" | "assistant"
  content: string
  type: "text" | "image"
  audioElement?: HTMLAudioElement
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

const SYSTEM_PROMPT = `Te Nexus vagy, egy magyar nyelvű AI asszisztens. Legyél segítőkész, tömör és informatív.

FONTOS SZABÁLYOK:
- Minden válaszod legyen RÖVID és LÉNYEGRE TÖRŐ (max 2-3 mondat, hacsak nem kérnek részletes magyarázatot)
- Magyarul válaszolj, ha magyarul kérdeznek
- Ne használj felesleges köszöntéseket vagy bevezető mondatokat
- Azonnal térj a lényegre

Tudnivalók:
- Magyar Ádám a Nexus CEO-ja és alapítója, egy tehetséges fejlesztő és vállalkozó.
- A Nexus egy modern AI platform chat és hang funkciókkal.`

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState<"chat" | "image">("chat")

  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [apiReady] = useState(true)
  const [showWelcome, setShowWelcome] = useState(true)
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognitionAPI) {
        setSpeechSupported(true)
        const recognition = new SpeechRecognitionAPI()
        recognition.continuous = false
        recognition.interimResults = true
        recognition.lang = 'en-US'
        
        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('')
          setInput(transcript)
        }
        
        recognition.onend = () => {
          setIsListening(false)
        }
        
        recognition.onerror = () => {
          setIsListening(false)
        }
        
        recognitionRef.current = recognition
      }
    }
  }, [])

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return
    
    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      recognitionRef.current.start()
      setIsListening(true)
    }
  }, [isListening])

  // Browser native TTS (free and unlimited)
  const speakText = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1
      utterance.pitch = 1
      utterance.volume = 1
      window.speechSynthesis.speak(utterance)
    }
  }, [])

  const resetToHome = () => {
    setMessages([])
    setShowWelcome(true)
    setInput("")
    if (currentAudio) {
      currentAudio.pause()
      setCurrentAudio(null)
    }
  }

  const playAudio = (text: string) => {
    // Use browser's native TTS (free and unlimited)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1
      utterance.pitch = 1
      utterance.volume = 1
      utterance.onend = () => setCurrentAudio(null)
      // Create a dummy audio element to track playing state
      const dummyAudio = new Audio()
      setCurrentAudio(dummyAudio)
      window.speechSynthesis.speak(utterance)
    }
  }

  const stopAudio = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setCurrentAudio(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading || !apiReady) return

    setShowWelcome(false)

    const userMessage: Message = {
      role: "user",
      content: input,
      type: mode === "chat" ? "text" : "image",
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      if (mode === "chat") {
        // Build conversation with system prompt
        const conversationMessages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages.map(m => ({ role: m.role, content: m.content })),
          { role: "user", content: input }
        ]
        
        // Call the NVIDIA API via our API route
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: conversationMessages }),
        })
        
        if (!response.ok) {
          throw new Error('Failed to get response')
        }
        
        // Read the streaming response
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let messageContent = ''
        
        // Add empty assistant message that we'll update
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "", type: "text" },
        ])
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            const text = decoder.decode(value, { stream: true })
            messageContent += text
            
            // Update the last message with new content
            setMessages((prev) => {
              const newMessages = [...prev]
              newMessages[newMessages.length - 1] = {
                role: "assistant",
                content: messageContent,
                type: "text",
              }
              return newMessages
            })
          }
        }

        // Auto-play TTS if enabled (using free browser TTS)
        if (ttsEnabled && messageContent) {
          setTimeout(() => {
            playAudio(messageContent)
          }, 100)
        }
      } else {
        // Image generation mode - using NVIDIA Stable Diffusion 3
        const response = await fetch('/api/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: input }),
        })

        if (!response.ok) {
          throw new Error('Failed to generate image')
        }

        const data = await response.json()
        
        if (data.image) {
          // The API returns base64 image
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `data:image/png;base64,${data.image}`, type: "image" },
          ])
        } else if (data.error) {
          throw new Error(data.error)
        }
      }
    } catch (error) {
      console.error("Error:", error)
      setMessages((prev) => {
        // Remove the empty streaming message if there was an error
        const filtered = prev.filter(m => m.content !== '')
        return [
          ...filtered,
          { role: "assistant", content: "An error occurred. Please try again.", type: "text" },
        ]
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">
        {/* Animated grid background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />
        </div>

        {/* Floating orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[10%] left-[15%] w-[500px] h-[500px] bg-white/[0.02] rounded-full blur-[120px] animate-float-slow" />
          <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px] bg-white/[0.015] rounded-full blur-[100px] animate-float-slower" />
          <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/[0.01] rounded-full blur-[150px] animate-pulse-ultra-slow" />
        </div>

        {/* Scan line effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(255,255,255,0.01)_50%)] bg-[length:100%_4px] animate-scan" />
        </div>

        {/* Header */}
        <header className="relative z-10 px-6 py-8 md:py-10">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            {/* Logo - clickable to go home */}
            <button 
              onClick={resetToHome}
              className="flex items-center gap-4 group cursor-pointer"
            >
              <div className="relative overflow-hidden">
                <div className="w-12 h-12 md:w-14 md:h-14 border border-white/20 rounded-2xl flex items-center justify-center group-hover:border-white/50 transition-all duration-700 group-hover:scale-110 group-hover:rotate-3">
                  <span className="text-white font-bold text-xl md:text-2xl tracking-tighter group-hover:scale-110 transition-transform duration-500">N</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-700 rounded-2xl" />
              </div>
              <div className="overflow-hidden">
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white translate-y-0 group-hover:-translate-y-1 transition-transform duration-500">
                  Nexus
                </h1>
                <p className="text-[10px] md:text-xs text-white/30 font-light tracking-widest uppercase translate-y-0 group-hover:-translate-y-1 transition-transform duration-500 delay-75">
                  AI Assistant
                </p>
              </div>
            </button>
            
            {/* Mode Toggle */}
            <div className="flex items-center gap-3">
              {/* Feature toggles */}
              <div className="hidden md:flex items-center gap-2 mr-2">
                <button
                  onClick={() => setTtsEnabled(!ttsEnabled)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-500 ${
                    ttsEnabled
                      ? "bg-white/10 text-white border border-white/20"
                      : "text-white/30 hover:text-white/60 border border-transparent hover:border-white/10"
                  }`}
                  title="Text to Speech"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Voice</span>
                </button>
              </div>

              <div className="flex items-center gap-1 p-1.5 border border-white/10 rounded-2xl bg-white/[0.02] backdrop-blur-sm">
                <button
                  onClick={() => setMode("chat")}
                  className={`flex items-center gap-2 px-5 md:px-6 py-3 rounded-xl text-xs md:text-sm font-medium transition-all duration-500 ${
                    mode === "chat"
                      ? "bg-white text-black shadow-lg shadow-white/10"
                      : "text-white/40 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Chat</span>
                </button>
                <button
                  onClick={() => setMode("image")}
                  className={`flex items-center gap-2 px-5 md:px-6 py-3 rounded-xl text-xs md:text-sm font-medium transition-all duration-500 ${
                    mode === "image"
                      ? "bg-white text-black shadow-lg shadow-white/10"
                      : "text-white/40 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>Create</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile feature toggles */}
        <div className="md:hidden relative z-10 px-6 pb-4">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all duration-500 ${
                ttsEnabled
                  ? "bg-white/10 text-white border border-white/20"
                  : "text-white/30 hover:text-white/60 border border-white/10"
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice</span>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <main className="relative z-10 flex-1 flex flex-col">
          <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col px-6">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto py-4 min-h-0">
              {showWelcome && messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <div className="relative mb-16 animate-float">
                    <div className="w-24 h-24 md:w-32 md:h-32 border border-white/10 rounded-3xl flex items-center justify-center backdrop-blur-sm bg-white/[0.02]">
                      {mode === "chat" ? (
                        <MessageSquare className="w-10 h-10 md:w-14 md:h-14 text-white/50" strokeWidth={1} />
                      ) : (
                        <Sparkles className="w-10 h-10 md:w-14 md:h-14 text-white/50" strokeWidth={1} />
                      )}
                    </div>
                    <div className="absolute -inset-6 border border-white/5 rounded-[2rem] animate-ping-slow" />
                    <div className="absolute -inset-12 border border-white/[0.02] rounded-[3rem] animate-ping-slower" />
                  </div>
                  
                  <h2 className="text-5xl md:text-7xl lg:text-8xl font-semibold mb-8 text-white tracking-tight animate-fade-up">
                    {mode === "chat" ? "Ask anything" : "Imagine anything"}
                  </h2>
                  <p className="text-lg md:text-xl text-white/30 max-w-lg text-balance leading-relaxed animate-fade-up-delay font-light">
                    {mode === "chat"
                      ? "Powered by advanced AI with web search capabilities"
                      : "Transform your ideas into stunning visuals"}
                  </p>
                  
                  {/* Feature badges */}
                  <div className="mt-8 flex flex-wrap justify-center gap-3 animate-fade-up-delay">
                    <span className="px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs text-white/40 font-light">
                      GLM-4.7
                    </span>
                    <span className="px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs text-white/40 font-light">
                      NVIDIA AI
                    </span>
                    <span className="px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs text-white/40 font-light">
                      Streaming
                    </span>
                    <span className="px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs text-white/40 font-light">
                      Voice I/O
                    </span>
                  </div>
                  
                  <div className="mt-12 md:mt-16 flex flex-wrap justify-center gap-3 animate-fade-up-delay-2">
                    {mode === "chat" ? (
                      <>
                        <SuggestionPill onClick={() => setInput("Explain quantum computing simply")}>
                          Quantum computing
                        </SuggestionPill>
                        <SuggestionPill onClick={() => setInput("Write a creative story about AI")}>
                          Creative writing
                        </SuggestionPill>
                        <SuggestionPill onClick={() => setInput("Help me brainstorm ideas")}>
                          Brainstorm ideas
                        </SuggestionPill>
                      </>
                    ) : (
                      <>
                        <SuggestionPill onClick={() => setInput("Futuristic city at night, cyberpunk style")}>
                          Cyberpunk city
                        </SuggestionPill>
                        <SuggestionPill onClick={() => setInput("Minimalist abstract art, geometric shapes")}>
                          Abstract art
                        </SuggestionPill>
                        <SuggestionPill onClick={() => setInput("Serene mountain landscape at sunrise")}>
                          Nature scene
                        </SuggestionPill>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 md:space-y-8 pb-4">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      } animate-slide-up`}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div
                        className={`max-w-[85%] md:max-w-[70%] relative group ${
                          message.role === "user"
                            ? "bg-white text-black"
                            : "bg-gradient-to-br from-white/[0.05] to-white/[0.02] text-white border border-white/[0.08]"
                        } rounded-3xl px-6 md:px-8 py-5 md:py-6 transition-all duration-500 hover:scale-[1.01]`}
                      >
                        {message.type === "image" && message.role === "assistant" ? (
                          <div className="overflow-hidden rounded-2xl">
                            <img
                              src={message.content}
                              alt="Generated image"
                              className="max-w-full w-full h-auto"
                              crossOrigin="anonymous"
                            />
                          </div>
                        ) : (
                          <>
                            <p className={`text-[15px] md:text-base leading-[1.9] whitespace-pre-wrap ${
                              message.role === "assistant" 
                                ? "text-white/85 font-light" 
                                : "text-black font-normal"
                            }`}>
                              {message.content}
                            </p>
                            {/* TTS button for assistant messages */}
                            {message.role === "assistant" && message.type === "text" && (
                              <button
                                onClick={() => currentAudio ? stopAudio() : playAudio(message.content)}
                                className="absolute -bottom-3 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 p-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10"
                              >
                                {currentAudio ? (
                                  <VolumeX className="w-3.5 h-3.5 text-white/60" />
                                ) : (
                                  <Volume2 className="w-3.5 h-3.5 text-white/60" />
                                )}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start animate-fade-in">
                      <div className="bg-gradient-to-br from-white/[0.05] to-white/[0.02] text-white border border-white/[0.08] rounded-3xl px-6 md:px-8 py-5 md:py-6">
                        <div className="flex items-center gap-4">
                          <div className="flex gap-1.5">
                            <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                          <span className="text-sm text-white/30 font-light">
                            {mode === "chat" ? "Thinking..." : "Creating your image..."}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Area - Positioned Lower */}
            <div className="py-8 md:py-12 mt-auto">
              <form onSubmit={handleSubmit} className="relative">
                <div className="relative group">
                  <div className="absolute -inset-[2px] bg-gradient-to-r from-white/0 via-white/30 to-white/0 rounded-3xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-700 blur-md" />
                  <div className="relative flex items-center gap-3 bg-white/[0.03] border border-white/[0.1] rounded-2xl p-2.5 focus-within:border-white/25 transition-all duration-500 backdrop-blur-sm">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={
                        isListening 
                          ? "Listening..."
                          : mode === "chat"
                            ? "Ask me anything..."
                            : "Describe your image in detail..."
                      }
                      className="flex-1 bg-transparent text-white placeholder:text-white/25 px-5 py-4 text-base focus:outline-none font-light"
                      disabled={isLoading}
                    />
                    {/* Voice Input Button */}
                    {speechSupported && (
                      <Button
                        type="button"
                        size="icon"
                        onClick={toggleListening}
                        className={`h-12 w-12 md:h-13 md:w-13 rounded-xl transition-all duration-300 hover:scale-105 ${
                          isListening 
                            ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
                            : "bg-white/10 hover:bg-white/20 text-white border border-white/10"
                        }`}
                        disabled={isLoading}
                      >
                        {isListening ? (
                          <MicOff className="w-5 h-5" />
                        ) : (
                          <Mic className="w-5 h-5" />
                        )}
                      </Button>
                    )}
                    <Button
                      type="submit"
                      size="icon"
                      className="h-12 w-12 md:h-14 md:w-14 rounded-xl bg-white hover:bg-white/90 text-black transition-all duration-300 hover:scale-105 disabled:opacity-20 disabled:hover:scale-100 shadow-lg shadow-white/5"
                      disabled={isLoading || !input.trim()}
                    >
                      {isLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </Button>
                  </div>
                </div>
                
              </form>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-10 py-8 md:py-10">
          <div className="max-w-5xl mx-auto px-6 flex flex-col items-center gap-4">
            <div className="flex items-center gap-6">
              <a
                href="https://www.instagram.com/ad4mm._15"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 text-white/20 hover:text-white/60 transition-all duration-500"
              >
                <Instagram className="w-4 h-4 group-hover:scale-110 transition-transform duration-300" />
                <span className="text-xs font-light">@ad4mm._15</span>
              </a>
            </div>
            <p className="text-[10px] text-white/15 font-light tracking-wider uppercase">
              Powered by NVIDIA AI
            </p>
          </div>
        </footer>
      </div>

      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
        
        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, -40px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        
        @keyframes float-slower {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-30px, 30px) scale(1.05); }
          66% { transform: translate(20px, -20px) scale(0.95); }
        }
        
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes ping-slow {
          0% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.15); opacity: 0; }
          100% { transform: scale(1); opacity: 0.4; }
        }
        
        @keyframes ping-slower {
          0% { transform: scale(1); opacity: 0.2; }
          50% { transform: scale(1.2); opacity: 0; }
          100% { transform: scale(1); opacity: 0.2; }
        }
        
        @keyframes pulse-ultra-slow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
        
        @keyframes scan {
          0% { transform: translateY(0); }
          100% { transform: translateY(4px); }
        }
        
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        
        .animate-float-slow {
          animation: float-slow 25s ease-in-out infinite;
        }
        
        .animate-float-slower {
          animation: float-slower 30s ease-in-out infinite;
        }
        
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
        }
        
        .animate-fade-up {
          animation: fade-up 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        
        .animate-fade-up-delay {
          opacity: 0;
          animation: fade-up 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
        }
        
        .animate-fade-up-delay-2 {
          opacity: 0;
          animation: fade-up 1s cubic-bezier(0.16, 1, 0.3, 1) 0.4s forwards;
        }
        
        .animate-slide-up {
          animation: slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        
        .animate-ping-slow {
          animation: ping-slow 4s ease-in-out infinite;
        }
        
        .animate-ping-slower {
          animation: ping-slower 5s ease-in-out infinite;
        }
        
        .animate-pulse-ultra-slow {
          animation: pulse-ultra-slow 12s ease-in-out infinite;
        }
        
        .animate-scan {
          animation: scan 0.5s linear infinite;
        }
      `}</style>
    </>
  )
}

function SuggestionPill({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-5 md:px-6 py-3 md:py-3.5 border border-white/[0.08] hover:border-white/25 hover:bg-white/[0.03] rounded-2xl text-sm text-white/40 hover:text-white/80 font-light transition-all duration-500 hover:scale-105 hover:shadow-lg hover:shadow-white/5"
    >
      {children}
    </button>
  )
}
