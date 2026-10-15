import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Send, Mic, Bot, User } from "lucide-react";

interface Message {
  id: number;
  sender: 'user' | 'ai';
  message: string;
  timestamp: string;
  metadata?: any;
}

interface AIChatProps {
  language: string;
}

export default function AIChat({ language }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Prefer farmer id from registration / seed; fall back to 1 for demos
  const farmerId = Number(
    (typeof window !== "undefined" && localStorage.getItem("cropguard_farmer_id")) || "1",
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Create conversation when component mounts
  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/chat/conversations", {
        farmerId,
        language,
      });
      return response.json();
    },
    onSuccess: (conversation) => {
      setConversationId(conversation.id);
      // Add initial AI greeting
      const greeting: Message = {
        id: Date.now(),
        sender: 'ai',
        message: getGreetingMessage(language),
        timestamp: new Date().toISOString(),
      };
      setMessages([greeting]);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start conversation. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, conversationId }: { message: string; conversationId: number }) => {
      const response = await apiRequest("POST", `/api/chat/conversations/${conversationId}/messages`, {
        message,
        sender: "user",
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.messages) {
        setMessages(data.messages);
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Initialize conversation on mount
  useEffect(() => {
    createConversationMutation.mutate();
  }, []);

  const getGreetingMessage = (lang: string) => {
    const greetings = {
      en: "Hello! I'm here to help you file your crop insurance claim. Can you please provide your name and mobile number?",
      hi: "नमस्ते! मैं आपके फसल बीमा दावे को दर्ज करने में आपकी सहायता के लिए यहाँ हूँ। कृपया अपना नाम और मोबाइल नंबर बताएं।",
      mr: "नमस्कार! मी तुमच्या पीक विमा दाव्यासाठी मदत करण्यासाठी इथे आहे. कृपया तुमचे नाव आणि मोबाइल नंबर सांगा.",
    };
    return greetings[lang as keyof typeof greetings] || greetings.en;
  };

  const handleSendMessage = () => {
    if (!currentMessage.trim() || !conversationId) return;

    const userMessage: Message = {
      id: Date.now(),
      sender: 'user',
      message: currentMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    sendMessageMutation.mutate({ message: currentMessage, conversationId });
    setCurrentMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessage = (message: string) => {
    // Simple formatting for line breaks and bold text
    return message
      .split('\n')
      .map((line, index) => (
        <span key={index}>
          {line}
          {index < message.split('\n').length - 1 && <br />}
        </span>
      ));
  };

  return (
    <div className="flex flex-col h-96">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {createConversationMutation.isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-12 w-1/2 ml-auto" />
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start space-x-3 ${
                message.sender === 'user' ? 'justify-end' : ''
              }`}
            >
              {message.sender === 'ai' && (
                <div className="w-8 h-8 bg-hsl(142, 71%, 45%) text-white rounded-full flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              
              <div
                className={`rounded-lg p-3 max-w-md ${
                  message.sender === 'ai'
                    ? 'bg-gray-100 text-gray-900'
                    : 'bg-hsl(142, 71%, 45%) text-white'
                }`}
              >
                <div className="text-sm">{formatMessage(message.message)}</div>
                
                {/* Special formatting for claim results */}
                {message.metadata?.step === 'approved' && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-green-800 text-xs">
                    <div className="flex items-center mb-1">
                      <i className="fas fa-check-circle mr-1"></i>
                      <span className="font-semibold">Claim Approved!</span>
                    </div>
                    <div className="space-y-1">
                      <p><strong>Amount:</strong> ₹{message.metadata.amount?.toLocaleString()}</p>
                      <p><strong>Settlement:</strong> Within 12 hours</p>
                    </div>
                  </div>
                )}
                
                <div className="text-xs opacity-70 mt-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
              
              {message.sender === 'user' && (
                <div className="w-8 h-8 bg-hsl(207, 90%, 54%) text-white rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}
        
        {sendMessageMutation.isPending && (
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-hsl(142, 71%, 45%) text-white rounded-full flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-gray-100 rounded-lg p-3">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center space-x-2">
          <Input
            type="text"
            placeholder="Type your message..."
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
            disabled={!conversationId || sendMessageMutation.isPending}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!currentMessage.trim() || !conversationId || sendMessageMutation.isPending}
            className="bg-hsl(142, 71%, 45%) hover:bg-hsl(142, 71%, 40%)"
          >
            <Send className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            className="text-gray-600 hover:bg-gray-100"
            disabled
          >
            <Mic className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
