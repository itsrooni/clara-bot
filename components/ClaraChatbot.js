import { useState, useRef, useEffect } from 'react';
import { FaMicrophone, FaPaperPlane, FaStop, FaSpinner } from 'react-icons/fa';
import VisualizerBars from './VisualizerBars';
import { GeminiChat } from '../utils/gemini';
import { loginUser, registerUser, searchProperties, searchCities } from '../lib/nestzone';
import PropertyCard from './PropertyCard';

const ROLE_OPTIONS = [
  { name: 'Public User', value: 'PUBLIC_USER' },
  { name: 'Agent', value: 'AGENT' },
  { name: 'Investor', value: 'INVESTOR' },
  { name: 'Land Lord', value: 'LAND_LORD' },
  { name: 'Developer', value: 'DEVELOPER' },
  { name: 'Private Seller', value: 'PRIVATE_SELLER' },
  { name: 'Agency', value: 'AGENCY' },
  { name: 'Sponsor', value: 'SPONSOR' }
];

const registrationFields = [
  { key: 'firstName', label: "What is your first name?" },
  { key: 'lastName', label: "What is your last name?" },
  { key: 'email', label: "What is your email address?", validate: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
  { key: 'mobile', label: "What is your mobile number?", validate: v => v.replace(/\D/g, '').length >= 10 }
];

const loginFields = [
  { key: 'username', label: "Please say your email address.", validate: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
  { key: 'password', label: "Now say your password." }
];

function normalizeSpokenEmail(email) {
  return email
    .toLowerCase()
    .replace(/^.*\b(my|i am|it is|the email is|email is|this is)\b[\s:,-]*/i, '')
    .replace(/ at the rate | at the read | at the right | at the red | at the raid /gi, '@')
    .replace(/ at /gi, '@')
    .replace(/ dot /gi, '.')
    .replace(/ underscore /gi, '_')
    .replace(/ dash /gi, '-')
    .replace(/ plus /gi, '+')
    .replace(/\s+/g, '')
    .trim();
}

function summarizeProperties(props) {
  return props.map((p, idx) => {
    const type = p.type ? p.type.charAt(0).toUpperCase() + p.type.slice(1) : 'Property';
    const city = p.city || p.fileCityName || '';
    const province = p.province || p.fileProvinceName || '';
    const location = [city, province].filter(Boolean).join(', ');
    const bedrooms = p.bedrooms || 'N/A';
    const bathrooms = p.bathrooms || 'N/A';
    const price = p.price ? `€${p.price.toLocaleString()}` : 'N/A';
    return `${idx + 1}) ${type} in ${location}, Price: ${price}, Bedrooms: ${bedrooms}, Bathrooms: ${bathrooms}`;
  }).join('\n');
}

const SUPPORTED_CITIES = ["Madrid", "Barcelona", "Seville", "Valencia", "Malaga", "Bilbao", "Alicante", "Granada"];

function extractCity(text) {
  const lower = text.toLowerCase();
  for (let city of SUPPORTED_CITIES) {
    if (lower.includes(city.toLowerCase())) return city;
  }
  return null;
}

export default function ClaraChatbot() {
  const [messages, setMessages] = useState([
    { sender: 'clara', text: 'Hello, welcome to Nestzone, how can I assist you?' }
  ]);
  const [input, setInput] = useState('');
  const [form, setForm] = useState(null);
  const [properties, setProperties] = useState([]);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voicePhase, setVoicePhase] = useState(null);
  const [registerData, setRegisterData] = useState({});
  const [registerStep, setRegisterStep] = useState(0);
  const [loginData, setLoginData] = useState({});
  const [loginStep, setLoginStep] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Voice synthesis (Clara)
  const speak = (text, cb) => {
    if (!text || !synthRef.current) return;
    const voices = synthRef.current.getVoices();
    let preferredVoice =
      voices.find(v => v.name.includes('Jenny')) ||
      voices.find(v => v.name.includes('Google UK English Female')) ||
      voices.find(v => v.name.toLowerCase().includes('female')) ||
      voices.find(v => v.name.includes('Microsoft Zira')) ||
      voices[0];
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    if (preferredVoice) utterance.voice = preferredVoice;
    synthRef.current.cancel();
    synthRef.current.speak(utterance);
    utterance.onend = cb || (() => {});
  };

  // Cancel everything
  const handleCancel = () => {
    setIsVoiceMode(false);
    setVoicePhase(null);
    setRegisterStep(0);
    setRegisterData({});
    setLoginData({});
    setLoginStep(0);
    setForm(null);
    setIsListening(false);
    setIsLoading(false);
    setMessages(prev => [...prev, { sender: 'clara', text: 'Cancelled. How else can I help you?' }]);
    speak('Cancelled. How else can I help you?');
  };

  // Start general voice input (chat, not forms)
  const startGeneralListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support speech recognition.');
      setIsListening(false);
      return;
    }
    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'en-US';
      recognitionRef.current.interimResults = false;
      recognitionRef.current.continuous = false;
    }
    try {
      recognitionRef.current.onresult = (event) => {
        setIsListening(false);
        let transcript = event.results[0][0].transcript.trim();
        if (transcript.toLowerCase() === 'cancel' || transcript.toLowerCase() === 'stop') {
          handleCancel();
          return;
        }
        if (/register/i.test(transcript)) {
          startRegisterVoice();
          setIsVoiceMode(true);
          return;
        }
        if (/login/i.test(transcript)) {
          startLoginVoice();
          setIsVoiceMode(true);
          return;
        }
        setInput('');
        setMessages(prev => [...prev, { sender: 'user', text: transcript }]);
        setTimeout(() => sendMessageWithText(transcript), 300);
      };
      recognitionRef.current.onerror = () => {
        setIsListening(false);
        setMessages(prev => [...prev, { sender: 'clara', text: "Sorry, I didn't catch that. Please try again." }]);
        speak("Sorry, I didn't catch that. Please try again.");
      };
      recognitionRef.current.abort();
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err) {
      if (err.name === 'InvalidStateError') {
        try { recognitionRef.current.stop(); } catch (e) {}
        setTimeout(() => {
          try { recognitionRef.current.start(); setIsListening(true); } catch (e) {}
        }, 300);
      }
    }
  };

  // Registration flow
  const startRegisterVoice = () => {
    setVoicePhase('register');
    setRegisterStep(0);
    setRegisterData({});
    const prompt = registrationFields[0].label;
    setMessages(prev => [...prev, { sender: 'clara', text: prompt }]);
    speak(prompt, () => startListening('register'));
  };

  // Login flow
  const startLoginVoice = () => {
    setVoicePhase('login');
    setLoginStep(0);
    setLoginData({});
    const prompt = loginFields[0].label;
    setMessages(prev => [...prev, { sender: 'clara', text: prompt }]);
    speak(prompt, () => startListening('login'));
  };

  // Registration/Login listening
  const startListening = (mode = 'register', step = null) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support speech recognition.');
      setIsListening(false);
      return;
    }
    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'en-US';
      recognitionRef.current.interimResults = false;
      recognitionRef.current.continuous = false;
    }
    try {
      recognitionRef.current.onresult = (event) => {
        setIsListening(false);
        let transcript = event.results[0][0].transcript.trim();
        let answer = transcript;

        if (transcript.toLowerCase() === 'cancel' || transcript.toLowerCase() === 'stop') {
          handleCancel();
          return;
        }

        // ----- THIS SECTION IS CHANGED -----
        if (mode === 'register') {
          const currField = registrationFields[registerStep];
          let inputValue = transcript.trim();

          // If email step, normalize
          if (currField.key === "email") inputValue = normalizeSpokenEmail(inputValue);

          // Name validation
          if (
            (currField.key === "firstName" || currField.key === "lastName") &&
            (
              /@| at | at the rate | dot | gmail | hotmail | yahoo/i.test(inputValue) ||
              /^\d{8,}$/.test(inputValue.replace(/\s/g, '')) ||
              inputValue.length < 2
            )
          ) {
            setMessages(prev => [
              ...prev,
              { sender: 'clara', text: `That doesn't seem like a valid ${currField.key === "firstName" ? "first" : "last"} name. Please say just your ${currField.key === "firstName" ? "first" : "last"} name.` }
            ]);
            // 🔴 DO NOT ADVANCE registerStep, stay on this step!
            speak(`That doesn't seem like a valid ${currField.key === "firstName" ? "first" : "last"} name. Please say just your ${currField.key === "firstName" ? "first" : "last"} name.`);
            return; // <--- early exit
          }

          // Email validation
          if (currField.key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inputValue)) {
            setMessages(prev => [
              ...prev,
              { sender: 'clara', text: `That doesn't seem like a valid email address. Please try again.` }
            ]);
            speak("That doesn't seem like a valid email address. Please try again.");
            return;
          }

          // Mobile validation
          if (currField.key === 'mobile' && inputValue.replace(/\D/g, '').length < 10) {
            setMessages(prev => [
              ...prev,
              { sender: 'clara', text: `That doesn't seem like a valid mobile number. Please try again.` }
            ]);
            speak("That doesn't seem like a valid mobile number. Please try again.");
            return;
          }

          // ✅ Passed all validation: advance step!
          const updatedData = { ...registerData, [currField.key]: inputValue };
          setRegisterData(updatedData);
          setMessages(prev => [...prev, { sender: 'user', text: inputValue }]);

          const nextStep = registerStep + 1;
          if (nextStep < registrationFields.length) {
            setRegisterStep(nextStep);
            const nextPrompt = registrationFields[nextStep].label;
            setTimeout(() => {
              setMessages(msgs => [...msgs, { sender: 'clara', text: nextPrompt }]);
              speak(nextPrompt);
            }, 400);
          } else {
            setVoicePhase(null);
            setForm({
              type: 'register',
              ...updatedData,
              pass: '',
              retypedPass: '',
              roleType: '',
              confirmedTermsAndConditions: false,
              confirmedToGetUpdates: false
            });
            setIsVoiceMode(false);
          }
          return;
        }

        // ----- END OF SECTION -----

        // LOGIN - (unchanged)
        else if (mode === 'login') {
          const currField = loginFields[loginStep];
          if (currField.key === "username") {
            answer = normalizeSpokenEmail(transcript);
          }
          if (currField.validate && !currField.validate(answer)) {
            setMessages(prev => [
              ...prev,
              { sender: 'clara', text: "That doesn't seem like a valid email address. Please try again." }
            ]);
            speak("That doesn't seem like a valid email address. Please try again.");
            return;
          }
          const newLoginData = { ...loginData, [currField.key]: answer };
          setLoginData(newLoginData);
          setMessages(prev => [...prev, { sender: 'user', text: answer }]);
          setVoicePhase(null);
          setForm({
            type: 'login',
            username: newLoginData.username || answer,
            password: ''
          });
          setIsVoiceMode(false);
          return;
        }
      };
      recognitionRef.current.onerror = () => {
        setIsListening(false);
        setMessages(prev => [...prev, { sender: 'clara', text: "Sorry, I didn't catch that. Please try again." }]);
        speak("Sorry, I didn't catch that. Please try again.");
      };
      recognitionRef.current.abort();
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err) {
      if (err.name === 'InvalidStateError') {
        try { recognitionRef.current.stop(); } catch (e) {}
        setTimeout(() => {
          try { recognitionRef.current.start(); setIsListening(true); } catch (e) {}
        }, 300);
      }
    }
  };


  // Registration submit (manual)
  const handleRegisterFormSubmit = async () => {
    setIsLoading(true);
    const registrationData = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      mobile: form.mobile,
      pass: form.pass,
      retypedPass: form.retypedPass,
      roleType: form.roleType,
      confirmedTermsAndConditions: form.confirmedTermsAndConditions,
      confirmedToGetUpdates: form.confirmedToGetUpdates
    };
    const response = await registerUser(registrationData);
    setMessages(prev => [...prev, { sender: 'clara', text: response?.message || 'Registered successfully.' }]);
    speak(response?.message || 'Registered successfully.');
    setForm(null);
    setIsVoiceMode(false);
    setVoicePhase(null);
    setRegisterStep(0);
    setRegisterData({});
    setIsLoading(false);
  };

  // Login submit (manual)
  const handleLoginFormSubmit = async () => {
    setIsLoading(true);
    const response = await loginUser(form.username, form.password);
    const reply = { sender: 'clara', text: response?.message || 'Logged in successfully.' };
    setMessages((prev) => [...prev, reply]);
    speak(reply.text);
    setForm(null);
    setIsVoiceMode(false);
    setVoicePhase(null);
    setIsLoading(false);
    const next = { sender: 'clara', text: 'What else can I do for you?' };
    setMessages((prev) => [...prev, next]);
    speak(next.text);
  };

  // Core chat handler
  const sendMessageWithText = async (msgText) => {
    const newMessages = [...messages, { sender: 'user', text: msgText }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // Try to extract city
    const city = extractCity(msgText);
    if (city) {
      try {
        const loc = await searchCities(city);
        const locationId = loc?.data?.find(item => item.name.toLowerCase() === city.toLowerCase())?.id;
        if (locationId) {
          const results = await searchProperties({ locationId });
          const resultArray = Array.isArray(results?.data?.content) ? results.data.content : [];
          if (resultArray.length > 0) {
            setProperties(resultArray);

            // Show property cards first
            const reply = {
              sender: 'clara',
              text: `I found ${resultArray.length} properties in ${city}.`
            };
            setMessages([...newMessages, reply]);
            speak(reply.text);

            // Summarize properties for Gemini
            const summaries = summarizeProperties(resultArray.slice(0, 5));

            // Gemini prompt with only property data
            const aiPrompt = [
              { sender: 'user', text: `These are property listings:\n${summaries}\nBased only on this data, which is the best option and why? Respond clearly for a home buyer.` }
            ];
            const aiResponse = await GeminiChat(aiPrompt);
            let cleanText = aiResponse || '';
            cleanText = cleanText
              .replace(/^\s*\*/gm, '')
              .replace(/[\*`_#-]/g, '')
              .replace(/I ?('m|am) Clara[\.:,-]*/gi, '')
              .replace(/apologize[^\n]*\n?/gi, '')
              .trim();

            setMessages(prev => [...prev, { sender: 'clara', text: cleanText || "Let me know if you want to know more about any property!" }]);
            speak(cleanText || "Let me know if you want to know more about any property!");
            setIsLoading(false);
            return;
          }

          setMessages([...newMessages, reply]);
          speak(reply.text);
          setIsLoading(false);
          return;
        }
      } catch (e) {
        // Could log or handle error here
      }
    }

    // Fallback: Gemini
    const aiResponse = await GeminiChat([
      ...newMessages,
      ...properties.map(p => ({ sender: 'clara', text: `${p.title} - €${p.price}` }))
    ]);
    const cleanText =
      aiResponse && aiResponse.replace(/^I['’`]?m Clara[\.,:;!? ]*/i, '').trim();
    setMessages([...newMessages, { sender: 'clara', text: cleanText || "I'm here to help." }]);
    speak(cleanText || "I'm here to help.");
    setIsLoading(false);
  };

  // Text input send
  const sendMessage = () => {
    if (!input.trim()) return;
    sendMessageWithText(input);
  };

  useEffect(() => {
    if (synthRef.current) {
      speak('Hello, welcome to Nestzone, how can I assist you?');
      synthRef.current.onvoiceschanged = () => synthRef.current.getVoices();
    }
  }, []);

  // --- UI ---
  return (
    <div className="fixed bottom-6 right-6 w-[350px] max-h-[90vh] bg-white shadow-2xl rounded-2xl flex flex-col overflow-hidden border border-gray-200 z-50" role="region" aria-label="Clara chatbot">
      <div className="bg-blue-600 text-white px-4 py-3 text-lg font-semibold" aria-label="Clara Chatbot Header">Clara - Nestzone</div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`p-2 rounded-lg max-w-[85%] ${
              msg.sender === 'clara'
                ? 'bg-blue-100 text-black self-start'
                : 'bg-gray-200 text-black self-end ml-auto'
            }`}
            role="status"
            aria-live={msg.sender === 'clara' ? "polite" : "off"}
          >
            {msg.text}
          </div>
        ))}
        {properties.map((prop, idx) => (
          <PropertyCard key={idx} property={prop} />
        ))}
        <div ref={messagesEndRef}></div>
        {/* Login form (manual phase) */}
        {form?.type === 'login' && (
          <form className="space-y-2" aria-label="Login form" onSubmit={e => { e.preventDefault(); handleLoginFormSubmit(); }}>
            <label className="block text-xs" htmlFor="login-email">Email</label>
            <input
              type="email"
              id="login-email"
              placeholder="Email"
              className="w-full px-2 py-1 border rounded"
              aria-required="true"
              onChange={e => setForm({ ...form, username: e.target.value })}
              value={form.username}
            />
            <label className="block text-xs" htmlFor="login-password">Password</label>
            <input
              type="password"
              id="login-password"
              placeholder="Password"
              className="w-full px-2 py-1 border rounded"
              aria-required="true"
              onChange={e => setForm({ ...form, password: e.target.value })}
              value={form.password}
            />
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-1 rounded"
              aria-label="Login"
              disabled={isLoading}
            >
              {isLoading ? <FaSpinner className="animate-spin" /> : "Login"}
            </button>
            <button
              type="button"
              className="w-full bg-gray-300 text-black py-1 rounded"
              onClick={handleCancel}
              aria-label="Cancel login"
            >
              Cancel
            </button>
          </form>
        )}
        {/* Registration (manual phase, password/role/terms) */}
        {form?.type === 'register' && (
          <form className="space-y-2" aria-label="Registration form" onSubmit={e => { e.preventDefault(); handleRegisterFormSubmit(); }}>
            <div className="grid grid-cols-2 gap-2 bg-gray-50 p-2 rounded">
              <div className="text-xs font-semibold text-gray-700">First Name:</div>
              <div className="text-xs">{form.firstName}</div>
              <div className="text-xs font-semibold text-gray-700">Last Name:</div>
              <div className="text-xs">{form.lastName}</div>
              <div className="text-xs font-semibold text-gray-700">Email:</div>
              <div className="text-xs">{form.email}</div>
              <div className="text-xs font-semibold text-gray-700">Mobile:</div>
              <div className="text-xs">{form.mobile}</div>
            </div>
            <label className="block text-xs" htmlFor="reg-password">Password</label>
            <input
              type="password"
              id="reg-password"
              placeholder="Password"
              className="w-full px-2 py-1 border rounded"
              aria-required="true"
              onChange={e => setForm({ ...form, pass: e.target.value })}
              value={form.pass}
            />
            <label className="block text-xs" htmlFor="reg-retype">Confirm Password</label>
            <input
              type="password"
              id="reg-retype"
              placeholder="Confirm Password"
              className="w-full px-2 py-1 border rounded"
              aria-required="true"
              onChange={e => setForm({ ...form, retypedPass: e.target.value })}
              value={form.retypedPass}
            />
            <label className="block text-xs" htmlFor="reg-role">Role</label>
            <select
              id="reg-role"
              className="w-full px-2 py-1 border rounded"
              value={form.roleType}
              aria-required="true"
              onChange={e => setForm({ ...form, roleType: e.target.value })}
            >
              <option value="">Select Role</option>
              {ROLE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.name}</option>
              ))}
            </select>
            <div className="flex gap-2 items-center">
              <input
                type="checkbox"
                id="reg-terms"
                checked={form.confirmedTermsAndConditions}
                aria-checked={form.confirmedTermsAndConditions}
                onChange={e => setForm({ ...form, confirmedTermsAndConditions: e.target.checked })}
              />
              <label className="text-xs" htmlFor="reg-terms">Agree to terms</label>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="checkbox"
                id="reg-updates"
                checked={form.confirmedToGetUpdates}
                aria-checked={form.confirmedToGetUpdates}
                onChange={e => setForm({ ...form, confirmedToGetUpdates: e.target.checked })}
              />
              <label className="text-xs" htmlFor="reg-updates">Get email updates</label>
            </div>
            <button
              type="submit"
              className="w-full bg-green-600 text-white py-1 rounded"
              aria-label="Register"
              disabled={isLoading}
            >
              {isLoading ? <FaSpinner className="animate-spin" /> : "Register"}
            </button>
            <button
              type="button"
              className="w-full bg-gray-300 text-black py-1 rounded"
              onClick={handleCancel}
              aria-label="Cancel registration"
            >
              Cancel
            </button>
          </form>
        )}
      </div>
      {/* Footer controls */}
      <div className="p-2 border-t flex items-center gap-2" aria-label="Chat input controls">
        {/* Voice mode: mic/stop + visualizer only */}
        {isVoiceMode || isListening ? (
          <>
            <button
              onClick={() => {
                if (isListening && recognitionRef.current) {
                  recognitionRef.current.stop();
                  setIsListening(false);
                } else if (voicePhase) {
                  startListening(voicePhase);
                } else {
                  setIsVoiceMode(true);
                  startGeneralListening();
                }
              }}
              className="text-blue-600 hover:text-blue-800"
              aria-label={isListening ? "Stop recording" : "Start voice"}
            >
              {isListening ? <FaStop /> : <FaMicrophone />}
            </button>
            <div className="flex-1">
              <VisualizerBars active={isListening} />
            </div>
            <button className="bg-gray-300 text-black px-3 py-1 rounded" onClick={handleCancel} aria-label="Cancel voice">
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setIsVoiceMode(true);
                startGeneralListening();
              }}
              className="text-blue-600 hover:text-blue-800"
              aria-label="Start voice"
            >
              <FaMicrophone />
            </button>
            <input
              type="text"
              className="flex-1 px-2 py-1 border rounded"
              placeholder="Type your message..."
              aria-label="Type your message"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
            />
            <button
              onClick={sendMessage}
              className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
              aria-label="Send message"
              disabled={isLoading}
            >
              {isLoading ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}



// import { useState, useRef, useEffect } from 'react';
// import { FaMicrophone, FaPaperPlane, FaStop, FaSpinner } from 'react-icons/fa';
// import VisualizerBars from './VisualizerBars';
// import { GeminiChat } from '../utils/gemini';
// import { loginUser, registerUser, searchProperties, searchCities } from '../lib/nestzone';
// import PropertyCard from './PropertyCard';

// const ROLE_OPTIONS = [
//   { name: 'Public User', value: 'PUBLIC_USER' },
//   { name: 'Agent', value: 'AGENT' },
//   { name: 'Investor', value: 'INVESTOR' },
//   { name: 'Land Lord', value: 'LAND_LORD' },
//   { name: 'Developer', value: 'DEVELOPER' },
//   { name: 'Private Seller', value: 'PRIVATE_SELLER' },
//   { name: 'Agency', value: 'AGENCY' },
//   { name: 'Sponsor', value: 'SPONSOR' }
// ];

// const registrationFields = [
//   { key: 'firstName', label: "What is your first name?" },
//   { key: 'lastName', label: "What is your last name?" },
//   { key: 'email', label: "What is your email address?", validate: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
//   { key: 'mobile', label: "What is your mobile number?", validate: v => v.replace(/\D/g, '').length >= 10 }
//   // { key: 'mobile', label: "What is your mobile number?", validate: v => /^\+?\d{10,15}$/.test(v.replace(/\s/g, '')) }
// ];

// const loginFields = [
//   { key: 'username', label: "Please say your email address.", validate: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
//   { key: 'password', label: "Now say your password." }
// ];

// // Helper for spoken emails (at, dot, underscore, dash)
// function normalizeSpokenEmail(email) {
//   return email
//     .toLowerCase()
//     .replace(/^.*\b(my|i am|it is|the email is|email is|this is)\b[\s:,-]*/i, '') // Remove leading phrases
//     .replace(/ at the rate | at the read | at the right | at the red | at the raid /gi, '@')
//     .replace(/ at /gi, '@')
//     .replace(/ dot /gi, '.')
//     .replace(/ underscore /gi, '_')
//     .replace(/ dash /gi, '-')
//     .replace(/ plus /gi, '+')
//     .replace(/\s+/g, '') // Remove all remaining spaces
//     .trim();
// }


// // --- Place summarizeProperties here! ---
// function summarizeProperties(props) {
//   return props.map((p, idx) => {
//     const type = p.type ? p.type.charAt(0).toUpperCase() + p.type.slice(1) : 'Property';
//     const city = p.city || p.fileCityName || '';
//     const province = p.province || p.fileProvinceName || '';
//     const location = [city, province].filter(Boolean).join(', ');
//     const bedrooms = p.bedrooms || 'N/A';
//     const bathrooms = p.bathrooms || 'N/A';
//     const price = p.price ? `€${p.price.toLocaleString()}` : 'N/A';

//     return `${idx + 1}) ${type} in ${location}, Price: ${price}, Bedrooms: ${bedrooms}, Bathrooms: ${bathrooms}`;
//   }).join('\n');
// }

// // You may wish to fetch this dynamically, but for now hard-code common cities
// const SUPPORTED_CITIES = ["Madrid", "Barcelona", "Seville", "Valencia", "Malaga", "Bilbao", "Alicante", "Granada"];

// function extractCity(text) {
//   const lower = text.toLowerCase();
//   for (let city of SUPPORTED_CITIES) {
//     if (lower.includes(city.toLowerCase())) return city;
//   }
//   return null;
// }

// export default function ClaraChatbot() {
//   const [messages, setMessages] = useState([
//     { sender: 'clara', text: 'Hello, welcome to Nestzone, how can I assist you?' }
//   ]);
//   const [input, setInput] = useState('');
//   const [form, setForm] = useState(null);
//   const [properties, setProperties] = useState([]);
//   const [isVoiceMode, setIsVoiceMode] = useState(false);
//   const [voicePhase, setVoicePhase] = useState(null);
//   const [registerData, setRegisterData] = useState({});
//   const [registerStep, setRegisterStep] = useState(0);
//   const [loginData, setLoginData] = useState({});
//   const [loginStep, setLoginStep] = useState(0);
//   const [isListening, setIsListening] = useState(false);
//   const [isLoading, setIsLoading] = useState(false);

//   const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
//   const recognitionRef = useRef(null);
//   const messagesEndRef = useRef(null);

//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
//   }, [messages]);

//   // Voice synthesis (Clara)
//   const speak = (text, cb) => {
//     if (!text || !synthRef.current) return;
//     const voices = synthRef.current.getVoices();
//     let preferredVoice =
//       voices.find(v => v.name.includes('Jenny')) ||
//       voices.find(v => v.name.includes('Google UK English Female')) ||
//       voices.find(v => v.name.toLowerCase().includes('female')) ||
//       voices.find(v => v.name.includes('Microsoft Zira')) ||
//       voices[0];
//     const utterance = new window.SpeechSynthesisUtterance(text);
//     utterance.lang = 'en-US';
//     if (preferredVoice) utterance.voice = preferredVoice;
//     synthRef.current.cancel();
//     synthRef.current.speak(utterance);
//     utterance.onend = cb || (() => {});
//   };

//   // Cancel everything
//   const handleCancel = () => {
//     setIsVoiceMode(false);
//     setVoicePhase(null);
//     setRegisterStep(0);
//     setRegisterData({});
//     setLoginData({});
//     setLoginStep(0);
//     setForm(null);
//     setIsListening(false);
//     setIsLoading(false);
//     setMessages(prev => [...prev, { sender: 'clara', text: 'Cancelled. How else can I help you?' }]);
//     speak('Cancelled. How else can I help you?');
//   };

//   // Start general voice input (chat, not forms)
//   const startGeneralListening = () => {
//     const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
//     if (!SpeechRecognition) {
//       alert('Your browser does not support speech recognition.');
//       setIsListening(false);
//       return;
//     }
//     if (!recognitionRef.current) {
//       recognitionRef.current = new SpeechRecognition();
//       recognitionRef.current.lang = 'en-US';
//       recognitionRef.current.interimResults = false;
//       recognitionRef.current.continuous = false;
//     }
//     try {
//       recognitionRef.current.onresult = (event) => {
//         setIsListening(false);
//         let transcript = event.results[0][0].transcript.trim();
//         if (transcript.toLowerCase() === 'cancel' || transcript.toLowerCase() === 'stop') {
//           handleCancel();
//           return;
//         }
//         if (/register/i.test(transcript)) {
//           startRegisterVoice();
//           setIsVoiceMode(true);
//           return;
//         }
//         if (/login/i.test(transcript)) {
//           startLoginVoice();
//           setIsVoiceMode(true);
//           return;
//         }
//         setInput('');
//         setMessages(prev => [...prev, { sender: 'user', text: transcript }]);
//         setTimeout(() => sendMessageWithText(transcript), 300);
//       };
//       recognitionRef.current.onerror = () => {
//         setIsListening(false);
//         setMessages(prev => [...prev, { sender: 'clara', text: "Sorry, I didn't catch that. Please try again." }]);
//         speak("Sorry, I didn't catch that. Please try again.");
//       };
//       recognitionRef.current.abort();
//       recognitionRef.current.start();
//       setIsListening(true);
//     } catch (err) {
//       if (err.name === 'InvalidStateError') {
//         try { recognitionRef.current.stop(); } catch (e) {}
//         setTimeout(() => {
//           try { recognitionRef.current.start(); setIsListening(true); } catch (e) {}
//         }, 300);
//       }
//     }
//   };

//   // Registration flow
//   const startRegisterVoice = () => {
//     setVoicePhase('register');
//     setRegisterStep(0);
//     setRegisterData({});
//     const prompt = registrationFields[0].label;
//     setMessages(prev => [...prev, { sender: 'clara', text: prompt }]);
//     speak(prompt, () => startListening('register'));
//   };

//   // Login flow
//   const startLoginVoice = () => {
//     setVoicePhase('login');
//     setLoginStep(0);
//     setLoginData({});
//     const prompt = loginFields[0].label;
//     setMessages(prev => [...prev, { sender: 'clara', text: prompt }]);
//     speak(prompt, () => startListening('login'));
//   };

//   // Registration/Login listening
//   const startListening = (mode = 'register') => {
//     const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
//     if (!SpeechRecognition) {
//       alert('Your browser does not support speech recognition.');
//       setIsListening(false);
//       return;
//     }
//     if (!recognitionRef.current) {
//       recognitionRef.current = new SpeechRecognition();
//       recognitionRef.current.lang = 'en-US';
//       recognitionRef.current.interimResults = false;
//       recognitionRef.current.continuous = false;
//     }
//     try {
//       recognitionRef.current.onresult = (event) => {
//         setIsListening(false);
//         let transcript = event.results[0][0].transcript.trim();
//         let processedTranscript = transcript;

//         if (transcript.toLowerCase() === 'cancel' || transcript.toLowerCase() === 'stop') {
//           handleCancel();
//           return;
//         }

//         if (mode === 'register') {
//           const currField = registrationFields[registerStep];
//           let answer = transcript.trim();

//           // Normalize email only for the email step
//           if (currField.key === "email") {
//             answer = normalizeSpokenEmail(answer);
//             console.log('Normalized email:', answer);
//           }

//           // Block clear email/phone in name steps
//           if (
//             (currField.key === "firstName" || currField.key === "lastName") &&
//             (
//               /@| at | at the rate | dot | gmail | hotmail | yahoo/i.test(answer) || // Email pattern
//               /^\d{8,}$/.test(answer.replace(/\s/g, '')) || // Obvious phone numbers (8+ digits)
//               answer.length < 2 // Name too short
//             )
//           ) {
//             setMessages(prev => [
//               ...prev,
//               { sender: 'clara', text: `That doesn't seem like a valid ${currField.key === "firstName" ? "first" : "last"} name. Please say just your ${currField.key === "firstName" ? "first" : "last"} name.` }
//             ]);
//             speak(`That doesn't seem like a valid ${currField.key === "firstName" ? "first" : "last"} name. Please say just your ${currField.key === "firstName" ? "first" : "last"} name.`, () => startListening('register'));
//             return;
//           }

//           // Email and mobile validation (custom logic)
//           if (currField.key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer)) {
//             setMessages(prev => [
//               ...prev,
//               { sender: 'clara', text: `That doesn't seem like a valid email address. Please try again.` }
//             ]);
//             speak("That doesn't seem like a valid email address. Please try again.", () => startListening('register'));
//             return;
//           }
//           if (currField.key === 'mobile' && answer.replace(/\D/g, '').length < 10) {
//             setMessages(prev => [
//               ...prev,
//               { sender: 'clara', text: `That doesn't seem like a valid mobile number. Please try again.` }
//             ]);
//             speak("That doesn't seem like a valid mobile number. Please try again.", () => startListening('register'));
//             return;
//           }

//           // Save data
//           const updatedData = { ...registerData, [currField.key]: answer };
//           setRegisterData(updatedData);
//           setMessages(prev => [...prev, { sender: 'user', text: answer }]);

//           // --- Always use current value, not async setState! ---
//           // Compute next step synchronously!
//           const nextStep = registerStep + 1;
//           if (nextStep < registrationFields.length) {
//             setRegisterStep(nextStep);
//             const nextPrompt = registrationFields[nextStep].label;
//             setTimeout(() => {
//               setMessages(msgs => [...msgs, { sender: 'clara', text: nextPrompt }]);
//               speak(nextPrompt, () => startListening('register'));
//             }, 400);
//           } else {
//             // Show the manual form for remaining fields
//             setVoicePhase(null);
//             setForm({
//               type: 'register',
//               ...updatedData,
//               pass: '',
//               retypedPass: '',
//               roleType: '',
//               confirmedTermsAndConditions: false,
//               confirmedToGetUpdates: false
//             });
//             setIsVoiceMode(false);
//           }
//           return;
//         } else if (mode === 'login') {
//           const currField = loginFields[loginStep];
//           if (currField.key === "username") {
//             processedTranscript = normalizeSpokenEmail(transcript);
//           }
//           if (currField.validate && !currField.validate(processedTranscript)) {
//             setMessages(prev => [
//               ...prev,
//               { sender: 'clara', text: "That doesn't seem like a valid email address. Please try again." }
//             ]);
//             speak("That doesn't seem like a valid email address. Please try again.", () => startListening('login'));
//             return;
//           }
//           // Store login data for this step
//           const newLoginData = { ...loginData, [currField.key]: processedTranscript };
//           setLoginData(newLoginData);
//           setMessages(prev => [...prev, { sender: 'user', text: processedTranscript }]);

//           // Only email is spoken, then show password input
//           setVoicePhase(null);
//           setForm({
//             type: 'login',
//             username: newLoginData.username || processedTranscript,
//             password: '' // User will type this
//           });
//           setIsVoiceMode(false);
//           return;
//         }

//       };
//       recognitionRef.current.onerror = () => {
//         setIsListening(false);
//         setMessages(prev => [...prev, { sender: 'clara', text: "Sorry, I didn't catch that. Please try again." }]);
//         speak("Sorry, I didn't catch that. Please try again.", () => startListening(mode));
//       };
//       recognitionRef.current.abort();
//       recognitionRef.current.start();
//       setIsListening(true);
//     } catch (err) {
//       if (err.name === 'InvalidStateError') {
//         try { recognitionRef.current.stop(); } catch (e) {}
//         setTimeout(() => {
//           try { recognitionRef.current.start(); setIsListening(true); } catch (e) {}
//         }, 300);
//       }
//     }
//   };


//   // Registration submit (manual)
//   const handleRegisterFormSubmit = async () => {
//     setIsLoading(true);
//     const registrationData = {
//       firstName: form.firstName,
//       lastName: form.lastName,
//       email: form.email,
//       mobile: form.mobile,
//       pass: form.pass,
//       retypedPass: form.retypedPass,
//       roleType: form.roleType,
//       confirmedTermsAndConditions: form.confirmedTermsAndConditions,
//       confirmedToGetUpdates: form.confirmedToGetUpdates
//     };
//     const response = await registerUser(registrationData);
//     setMessages(prev => [...prev, { sender: 'clara', text: response?.message || 'Registered successfully.' }]);
//     speak(response?.message || 'Registered successfully.');
//     setForm(null);
//     setIsVoiceMode(false);
//     setVoicePhase(null);
//     setRegisterStep(0);
//     setRegisterData({});
//     setIsLoading(false);
//   };

//   // Login submit (manual)
//   const handleLoginFormSubmit = async () => {
//     setIsLoading(true);
//     const response = await loginUser(form.username, form.password);
//     const reply = { sender: 'clara', text: response?.message || 'Logged in successfully.' };
//     setMessages((prev) => [...prev, reply]);
//     speak(reply.text);
//     setForm(null);
//     setIsVoiceMode(false);
//     setVoicePhase(null);
//     setIsLoading(false);
//     const next = { sender: 'clara', text: 'What else can I do for you?' };
//     setMessages((prev) => [...prev, next]);
//     speak(next.text);
//   };

//   // Core chat handler
//   const sendMessageWithText = async (msgText) => {
//     const newMessages = [...messages, { sender: 'user', text: msgText }];
//     setMessages(newMessages);
//     setInput('');
//     setIsLoading(true);

//     // Try to extract city
//     const city = extractCity(msgText);
//     if (city) {
//       try {
//         const loc = await searchCities(city);
//         const locationId = loc?.data?.find(item => item.name.toLowerCase() === city.toLowerCase())?.id;
//         if (locationId) {
//           const results = await searchProperties({ locationId });
//           const resultArray = Array.isArray(results?.data?.content) ? results.data.content : [];
//           if (resultArray.length > 0) {
//             setProperties(resultArray);

//             // Show property cards first
//             const reply = {
//               sender: 'clara',
//               text: `I found ${resultArray.length} properties in ${city}.`
//             };
//             setMessages([...newMessages, reply]);
//             speak(reply.text);

//             // Summarize properties for Gemini
//             const summaries = summarizeProperties(resultArray.slice(0, 5)); // Show max 5 for Gemini context

//             // Gemini prompt with only property data
//             const aiPrompt = [
//               { sender: 'user', text: `These are property listings:\n${summaries}\nBased only on this data, which is the best option and why? Respond clearly for a home buyer.` }
//             ];
//             const aiResponse = await GeminiChat(aiPrompt);
//             // Clean up Gemini output
//             let cleanText = aiResponse || '';
//             cleanText = cleanText
//               .replace(/^\s*\*/gm, '')          // Remove bullet points
//               .replace(/[\*`_#-]/g, '')         // Remove other markdown
//               .replace(/I ?('m|am) Clara[\.:,-]*/gi, '')
//               .replace(/apologize[^\n]*\n?/gi, '')
//               .trim();

//             setMessages(prev => [...prev, { sender: 'clara', text: cleanText || "Let me know if you want to know more about any property!" }]);
//             speak(cleanText || "Let me know if you want to know more about any property!");
//             setIsLoading(false);
//             return;
//           }

//           setMessages([...newMessages, reply]);
//           speak(reply.text);
//           setIsLoading(false);
//           return;
//         }
//       } catch (e) {
//         // Could log or handle error here
//       }
//     }

//     // Fallback: Gemini (never prepend "I'm Clara", remove it if present)
//     const aiResponse = await GeminiChat([
//       ...newMessages,
//       ...properties.map(p => ({ sender: 'clara', text: `${p.title} - €${p.price}` }))
//     ]);
//     const cleanText =
//       aiResponse && aiResponse.replace(/^I['’`]?m Clara[\.,:;!? ]*/i, '').trim();
//     setMessages([...newMessages, { sender: 'clara', text: cleanText || "I'm here to help." }]);
//     speak(cleanText || "I'm here to help.");
//     setIsLoading(false);
//   };

//   // Text input send
//   const sendMessage = () => {
//     if (!input.trim()) return;
//     sendMessageWithText(input);
//   };

//   useEffect(() => {
//     if (synthRef.current) {
//       speak('Hello, welcome to Nestzone, how can I assist you?');
//       synthRef.current.onvoiceschanged = () => synthRef.current.getVoices();
//     }
//   }, []);

//   // --- UI ---
//   return (
//     <div className="fixed bottom-6 right-6 w-[350px] max-h-[90vh] bg-white shadow-2xl rounded-2xl flex flex-col overflow-hidden border border-gray-200 z-50" role="region" aria-label="Clara chatbot">
//       <div className="bg-blue-600 text-white px-4 py-3 text-lg font-semibold" aria-label="Clara Chatbot Header">Clara - Nestzone</div>
//       <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
//         {messages.map((msg, index) => (
//           <div
//             key={index}
//             className={`p-2 rounded-lg max-w-[85%] ${
//               msg.sender === 'clara'
//                 ? 'bg-blue-100 text-black self-start'
//                 : 'bg-gray-200 text-black self-end ml-auto'
//             }`}
//             role="status"
//             aria-live={msg.sender === 'clara' ? "polite" : "off"}
//           >
//             {msg.text}
//           </div>
//         ))}
//         {properties.map((prop, idx) => (
//           <PropertyCard key={idx} property={prop} />
//         ))}
//         <div ref={messagesEndRef}></div>
//         {/* Login form (manual phase) */}
//         {form?.type === 'login' && (
//                     <form className="space-y-2" aria-label="Login form" onSubmit={e => { e.preventDefault(); handleLoginFormSubmit(); }}>
//             <label className="block text-xs" htmlFor="login-email">Email</label>
//             <input
//               type="email"
//               id="login-email"
//               placeholder="Email"
//               className="w-full px-2 py-1 border rounded"
//               aria-required="true"
//               onChange={e => setForm({ ...form, username: e.target.value })}
//               value={form.username}
//             />
//             <label className="block text-xs" htmlFor="login-password">Password</label>
//             <input
//               type="password"
//               id="login-password"
//               placeholder="Password"
//               className="w-full px-2 py-1 border rounded"
//               aria-required="true"
//               onChange={e => setForm({ ...form, password: e.target.value })}
//               value={form.password}
//             />
//             <button
//               type="submit"
//               className="w-full bg-blue-600 text-white py-1 rounded"
//               aria-label="Login"
//               disabled={isLoading}
//             >
//               {isLoading ? <FaSpinner className="animate-spin" /> : "Login"}
//             </button>
//             <button
//               type="button"
//               className="w-full bg-gray-300 text-black py-1 rounded"
//               onClick={handleCancel}
//               aria-label="Cancel login"
//             >
//               Cancel
//             </button>
//           </form>
//         )}
//         {/* Registration (manual phase, password/role/terms) */}
//         {form?.type === 'register' && (
//           <form className="space-y-2" aria-label="Registration form" onSubmit={e => { e.preventDefault(); handleRegisterFormSubmit(); }}>
//             <div className="grid grid-cols-2 gap-2 bg-gray-50 p-2 rounded">
//               <div className="text-xs font-semibold text-gray-700">First Name:</div>
//               <div className="text-xs">{form.firstName}</div>
//               <div className="text-xs font-semibold text-gray-700">Last Name:</div>
//               <div className="text-xs">{form.lastName}</div>
//               <div className="text-xs font-semibold text-gray-700">Email:</div>
//               <div className="text-xs">{form.email}</div>
//               <div className="text-xs font-semibold text-gray-700">Mobile:</div>
//               <div className="text-xs">{form.mobile}</div>
//             </div>
//             <label className="block text-xs" htmlFor="reg-password">Password</label>
//             <input
//               type="password"
//               id="reg-password"
//               placeholder="Password"
//               className="w-full px-2 py-1 border rounded"
//               aria-required="true"
//               onChange={e => setForm({ ...form, pass: e.target.value })}
//               value={form.pass}
//             />
//             <label className="block text-xs" htmlFor="reg-retype">Confirm Password</label>
//             <input
//               type="password"
//               id="reg-retype"
//               placeholder="Confirm Password"
//               className="w-full px-2 py-1 border rounded"
//               aria-required="true"
//               onChange={e => setForm({ ...form, retypedPass: e.target.value })}
//               value={form.retypedPass}
//             />
//             <label className="block text-xs" htmlFor="reg-role">Role</label>
//             <select
//               id="reg-role"
//               className="w-full px-2 py-1 border rounded"
//               value={form.roleType}
//               aria-required="true"
//               onChange={e => setForm({ ...form, roleType: e.target.value })}
//             >
//               <option value="">Select Role</option>
//               {ROLE_OPTIONS.map(opt => (
//                 <option key={opt.value} value={opt.value}>{opt.name}</option>
//               ))}
//             </select>
//             <div className="flex gap-2 items-center">
//               <input
//                 type="checkbox"
//                 id="reg-terms"
//                 checked={form.confirmedTermsAndConditions}
//                 aria-checked={form.confirmedTermsAndConditions}
//                 onChange={e => setForm({ ...form, confirmedTermsAndConditions: e.target.checked })}
//               />
//               <label className="text-xs" htmlFor="reg-terms">Agree to terms</label>
//             </div>
//             <div className="flex gap-2 items-center">
//               <input
//                 type="checkbox"
//                 id="reg-updates"
//                 checked={form.confirmedToGetUpdates}
//                 aria-checked={form.confirmedToGetUpdates}
//                 onChange={e => setForm({ ...form, confirmedToGetUpdates: e.target.checked })}
//               />
//               <label className="text-xs" htmlFor="reg-updates">Get email updates</label>
//             </div>
//             <button
//               type="submit"
//               className="w-full bg-green-600 text-white py-1 rounded"
//               aria-label="Register"
//               disabled={isLoading}
//             >
//               {isLoading ? <FaSpinner className="animate-spin" /> : "Register"}
//             </button>
//             <button
//               type="button"
//               className="w-full bg-gray-300 text-black py-1 rounded"
//               onClick={handleCancel}
//               aria-label="Cancel registration"
//             >
//               Cancel
//             </button>
//           </form>
//         )}
//       </div>
//       {/* Footer controls */}
//       <div className="p-2 border-t flex items-center gap-2" aria-label="Chat input controls">
//         {/* Voice mode: mic/stop + visualizer only */}
//         {isVoiceMode || isListening ? (
//           <>
//             <button
//               onClick={() => {
//                 if (isListening && recognitionRef.current) {
//                   recognitionRef.current.stop();
//                   setIsListening(false);
//                 } else if (voicePhase) {
//                   startListening(voicePhase);
//                 } else {
//                   setIsVoiceMode(true);
//                   startGeneralListening();
//                 }
//               }}
//               className="text-blue-600 hover:text-blue-800"
//               aria-label={isListening ? "Stop recording" : "Start voice"}
//             >
//               {isListening ? <FaStop /> : <FaMicrophone />}
//             </button>
//             <div className="flex-1">
//               <VisualizerBars active={isListening} />
//             </div>
//             <button className="bg-gray-300 text-black px-3 py-1 rounded" onClick={handleCancel} aria-label="Cancel voice">
//               Cancel
//             </button>
//           </>
//         ) : (
//           <>
//             <button
//               onClick={() => {
//                 setIsVoiceMode(true);
//                 startGeneralListening();
//               }}
//               className="text-blue-600 hover:text-blue-800"
//               aria-label="Start voice"
//             >
//               <FaMicrophone />
//             </button>
//             <input
//               type="text"
//               className="flex-1 px-2 py-1 border rounded"
//               placeholder="Type your message..."
//               aria-label="Type your message"
//               value={input}
//               onChange={e => setInput(e.target.value)}
//               onKeyDown={e => e.key === 'Enter' && sendMessage()}
//             />
//             <button
//               onClick={sendMessage}
//               className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
//               aria-label="Send message"
//               disabled={isLoading}
//             >
//               {isLoading ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />}
//             </button>
//           </>
//         )}
//       </div>
//     </div>
//   );
// }










// import { useState, useRef, useEffect } from 'react';
// import { FaMicrophone, FaPaperPlane } from 'react-icons/fa';
// import { GeminiChat } from '../utils/gemini';
// import { loginUser, registerUser, searchProperties, searchCities } from '../lib/nestzone';
// import PropertyCard from './PropertyCard';
// import VisualizerBars from './VisualizerBars';

// export default function ClaraChatbot() {
//   const [messages, setMessages] = useState([
//     { sender: 'clara', text: 'Hello, welcome to Nestzone, how can I assist you?' }
//   ]);
//   const [input, setInput] = useState('');
//   const [form, setForm] = useState(null);
//   const [properties, setProperties] = useState([]);
//   const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
//   const recognitionRef = useRef(null);

//   useEffect(() => {
//     if (synthRef.current) {
//       synthRef.current.onvoiceschanged = () => synthRef.current.getVoices();
//       speak('Hello, welcome to Nestzone, how can I assist you?');
//     }
//   }, []);

//   const speak = (text) => {
//     if (!text || !synthRef.current) return;

//     const loadVoices = () => {
//       const voices = synthRef.current.getVoices();
//       let preferredVoice =
//         voices.find(v => v.name.includes('Jenny')) ||
//         voices.find(v => v.name.includes('Google UK English Female')) ||
//         voices.find(v => v.name.toLowerCase().includes('female')) ||
//         voices.find(v => v.name.includes('Microsoft Zira')) ||
//         voices[0];

//       const utterance = new SpeechSynthesisUtterance(text);
//       utterance.lang = 'en-US';
//       if (preferredVoice) utterance.voice = preferredVoice;
//       synthRef.current.cancel();
//       synthRef.current.speak(utterance);
//     };

//     if (synthRef.current.getVoices().length === 0) {
//       window.speechSynthesis.onvoiceschanged = loadVoices;
//     } else {
//       loadVoices();
//     }
//   };

//   const handleMicClick = () => {
//     const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
//     if (!SpeechRecognition) {
//       alert('Your browser does not support speech recognition.');
//       return;
//     }

//     if (!recognitionRef.current) {
//       recognitionRef.current = new SpeechRecognition();
//       recognitionRef.current.lang = 'en-US';
//       recognitionRef.current.interimResults = false;
//       recognitionRef.current.continuous = false;
//       recognitionRef.current.onresult = (event) => {
//         const transcript = event.results[0][0].transcript;
//         setInput(transcript);
//       };
//     }

//     try {
//       recognitionRef.current.start();
//     } catch (error) {
//       if (error.name === 'InvalidStateError') {
//         recognitionRef.current.stop();
//         setTimeout(() => recognitionRef.current.start(), 200);
//       } else {
//         console.error(error);
//       }
//     }
//   };

//   const handleFormSubmit = async () => {
//     if (form?.type === 'login') {
//       const response = await loginUser(form.username, form.password);
//       const reply = { sender: 'clara', text: response?.message || 'Logged in successfully.' };
//       setMessages((prev) => [...prev, reply]);
//       speak(reply.text);
//       setForm(null);
//       const next = { sender: 'clara', text: 'What else can I do for you?' };
//       setMessages((prev) => [...prev, next]);
//       speak(next.text);
//     }
//     if (form?.type === 'register') {
//       const registrationData = {
//         firstName: form.firstName,
//         lastName: form.lastName,
//         email: form.email,
//         mobile: form.mobile,
//         pass: form.pass,
//         retypedPass: form.retypedPass,
//         roleType: form.roleType,
//         confirmedTermsAndConditions: form.confirmedTermsAndConditions,
//         confirmedToGetUpdates: form.confirmedToGetUpdates
//       };
//       const response = await registerUser(registrationData);
//       const reply = { sender: 'clara', text: response?.message || 'Registered successfully.' };
//       setMessages((prev) => [...prev, reply]);
//       speak(reply.text);
//       setForm(null);
//       const next = { sender: 'clara', text: 'How can I help you next?' };
//       setMessages((prev) => [...prev, next]);
//       speak(next.text);
//     }
//   };

//   const sendMessage = async () => {
//     if (!input.trim()) return;
//     const newMessages = [...messages, { sender: 'user', text: input }];
//     setMessages(newMessages);
//     setInput('');

//     const lower = input.toLowerCase();

//     if (lower.includes('login')) {
//       setForm({ type: 'login', username: '', password: '' });
//       return;
//     }
//     if (lower.includes('register')) {
//       setForm({
//         type: 'register',
//         firstName: '',
//         lastName: '',
//         email: '',
//         mobile: '',
//         pass: '',
//         retypedPass: '',
//         roleType: '',
//         confirmedTermsAndConditions: false,
//         confirmedToGetUpdates: false
//       });
//       return;
//     }

//     try {
//       const loc = await searchCities(input);
//       const locationMatch = loc?.data?.find(item =>
//         item.name.toLowerCase().includes('madrid')
//       );

//       const locationId = locationMatch?.id;

//       if (locationId) {
//         const results = await searchProperties({ locationId });
//         const resultArray = Array.isArray(results?.data) ? results.data : [];

//         setProperties(resultArray);

//         const reply = {
//           sender: 'clara',
//           text: resultArray.length > 0
//             ? `I found ${resultArray.length} properties.`
//             : `Sorry, I couldn’t find any properties for that location.`
//         };

//         setMessages([...newMessages, reply]);
//         speak(reply.text);

//         if (resultArray.length > 0) {
//           const combined = [
//             ...newMessages,
//             reply,
//             ...resultArray.map(p => ({ sender: 'clara', text: `${p.title} for €${p.price}` }))
//           ];
//           const aiResponse = await GeminiChat(combined);
//           const finalText = aiResponse.startsWith("I'm Clara") ? aiResponse : `I'm Clara. ${aiResponse}`;
//           setMessages(prev => [...prev, { sender: 'clara', text: finalText }]);
//           speak(finalText);
//         }
//         return;
//       }
//     } catch (err) {
//       console.error('Location search error:', err);
//     }

//     const fallbackResponse = await GeminiChat([
//       ...newMessages,
//       ...properties.map(p => ({ sender: 'clara', text: `${p.title} - €${p.price}` }))
//     ]);
//     const fallbackText = fallbackResponse.startsWith("I'm Clara")
//       ? fallbackResponse
//       : `I'm Clara. ${fallbackResponse}`;
//     setMessages([...newMessages, { sender: 'clara', text: fallbackText }]);
//     speak(fallbackText);
//   };

//     return (
//       <div className="fixed bottom-6 right-6 w-[350px] max-h-[90vh] bg-white shadow-2xl rounded-2xl flex flex-col overflow-hidden border border-gray-200 z-50">
//         <div className="bg-blue-600 text-white px-4 py-3 text-lg font-semibold">Clara - Nestzone</div>

//         <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
//           {messages.map((msg, index) => (
//             <div
//               key={index}
//               className={`p-2 rounded-lg max-w-[85%] ${
//                 msg.sender === 'clara'
//                   ? 'bg-blue-100 text-black self-start'
//                   : 'bg-gray-200 text-black self-end ml-auto'
//               }`}
//             >
//               {msg.text}
//             </div>
//           ))}

//           {properties.map((prop, idx) => (
//             <PropertyCard key={idx} property={prop} />
//           ))}

//           {form?.type === 'login' && (
//             <div className="space-y-2">
//               <input
//                 type="email"
//                 placeholder="Email"
//                 className="w-full px-2 py-1 border rounded"
//                 onChange={e => setForm({ ...form, username: e.target.value })}
//               />
//               <input
//                 type="password"
//                 placeholder="Password"
//                 className="w-full px-2 py-1 border rounded"
//                 onChange={e => setForm({ ...form, password: e.target.value })}
//               />
//               <button
//                 className="w-full bg-blue-600 text-white py-1 rounded"
//                 onClick={handleFormSubmit}
//               >
//                 Login
//               </button>
//             </div>
//           )}

//           {form?.type === 'register' && (
//             <div className="space-y-2">
//               <input type="text" placeholder="First Name" className="w-full px-2 py-1 border rounded"
//                 onChange={e => setForm({ ...form, firstName: e.target.value })}
//               />
//               <input type="text" placeholder="Last Name" className="w-full px-2 py-1 border rounded"
//                 onChange={e => setForm({ ...form, lastName: e.target.value })}
//               />
//               <input type="email" placeholder="Email" className="w-full px-2 py-1 border rounded"
//                 onChange={e => setForm({ ...form, email: e.target.value })}
//               />
//               <input type="tel" placeholder="Phone" className="w-full px-2 py-1 border rounded"
//                 onChange={e => setForm({ ...form, mobile: e.target.value })}
//               />
//               <input type="password" placeholder="Password" className="w-full px-2 py-1 border rounded"
//                 onChange={e => setForm({ ...form, pass: e.target.value })}
//               />
//               <input type="password" placeholder="Confirm Password" className="w-full px-2 py-1 border rounded"
//                 onChange={e => setForm({ ...form, retypedPass: e.target.value })}
//               />
//               <input type="text" placeholder="Role Type" className="w-full px-2 py-1 border rounded"
//                 onChange={e => setForm({ ...form, roleType: e.target.value })}
//               />
//               <div className="flex gap-2 items-center">
//                 <input type="checkbox" onChange={e => setForm({ ...form, confirmedTermsAndConditions: e.target.checked })} />
//                 <label className="text-xs">Agree to terms</label>
//               </div>
//               <div className="flex gap-2 items-center">
//                 <input type="checkbox" onChange={e => setForm({ ...form, confirmedToGetUpdates: e.target.checked })} />
//                 <label className="text-xs">Get email updates</label>
//               </div>
//               <button
//                 className="w-full bg-green-600 text-white py-1 rounded"
//                 onClick={handleFormSubmit}
//               >
//                 Register
//               </button>
//             </div>
//           )}
//         </div>

//         <div className="p-2 border-t flex items-center gap-2">
//           <button
//             onClick={handleMicClick}
//             className="text-blue-600 hover:text-blue-800"
//           >
//             <FaMicrophone />
//           </button>
//           <input
//             type="text"
//             className="flex-1 px-2 py-1 border rounded"
//             placeholder="Type your message..."
//             value={input}
//             onChange={e => setInput(e.target.value)}
//             onKeyDown={e => e.key === 'Enter' && sendMessage()}
//           />
//           <button
//             onClick={sendMessage}
//             className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
//           >
//             <FaPaperPlane />
//           </button>
//         </div>
//       </div>
//     );
// }