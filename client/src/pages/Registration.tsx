import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import NavigationHeader from "@/components/NavigationHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const registrationSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  mobileNumber: z.string().regex(/^\+?[1-9]\d{9,14}$/, "Invalid mobile number"),
  aadhaarNumber: z.string().regex(/^\d{12}$/, "Aadhaar number must be 12 digits"),
  state: z.string().min(1, "Please select a state"),
  district: z.string().min(1, "Please select a district"),
  agreedToTerms: z.boolean().refine(val => val, "You must agree to terms and conditions"),
});

type RegistrationForm = z.infer<typeof registrationSchema>;

export default function Registration() {
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState("");
  const [showOtpInput, setShowOtpInput] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      fullName: "",
      mobileNumber: "",
      aadhaarNumber: "",
      state: "",
      district: "",
      agreedToTerms: false,
    },
  });

  const sendOtpMutation = useMutation({
    mutationFn: async (mobileNumber: string) => {
      const response = await apiRequest("POST", "/api/auth/send-otp", {
        mobileNumber,
        purpose: "registration",
      });
      return response.json();
    },
    onSuccess: (data) => {
      setShowOtpInput(true);
      toast({
        title: "OTP Sent",
        description: "Please check your mobile for the verification code.",
      });
      // For demo purposes, show OTP in console
      if (data.otp) {
        console.log("Demo OTP:", data.otp);
        toast({
          title: "Demo OTP",
          description: `For demo: ${data.otp}`,
          variant: "default",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async ({ mobileNumber, otp }: { mobileNumber: string; otp: string }) => {
      const response = await apiRequest("POST", "/api/auth/verify-otp", {
        mobileNumber,
        otp,
        purpose: "registration",
      });
      return response.json();
    },
    onSuccess: () => {
      setStep(2);
      toast({
        title: "OTP Verified",
        description: "Mobile number verified successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Invalid OTP",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegistrationForm) => {
      const response = await apiRequest("POST", "/api/users/register", {
        ...data,
        userType: "farmer",
      });
      return response.json();
    },
    onSuccess: (user) => {
      if (user?.id) {
        localStorage.setItem("cropguard_farmer_id", String(user.id));
      }
      toast({
        title: "Registration Successful",
        description: "Your account has been created successfully.",
      });
      setLocation(`/dashboard/farmer/${user.id}`);
    },
    onError: (error) => {
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendOtp = () => {
    const mobileNumber = form.getValues("mobileNumber");
    if (!mobileNumber) {
      toast({
        title: "Error",
        description: "Please enter your mobile number first.",
        variant: "destructive",
      });
      return;
    }
    sendOtpMutation.mutate(mobileNumber);
  };

  const handleVerifyOtp = () => {
    const mobileNumber = form.getValues("mobileNumber");
    verifyOtpMutation.mutate({ mobileNumber, otp });
  };

  const onSubmit = (data: RegistrationForm) => {
    registerMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationHeader />
      
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="shadow-lg">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold text-gray-900 mb-2">
                Farmer Registration
              </CardTitle>
              <p className="text-gray-600">Join thousands of farmers who trust us with their crop insurance</p>
            </CardHeader>

            <CardContent className="p-8">
              {/* Registration Steps */}
              <div className="mb-8">
                <div className="flex items-center justify-center space-x-4">
                  <div className="flex items-center">
                    <div className={`w-8 h-8 ${step >= 1 ? 'bg-primary' : 'bg-gray-300'} text-white rounded-full flex items-center justify-center text-sm font-bold`}>
                      1
                    </div>
                    <span className="ml-2 text-sm text-gray-600">Personal Info</span>
                  </div>
                  <div className={`w-16 h-1 ${step >= 2 ? 'bg-primary' : 'bg-gray-300'}`}></div>
                  <div className="flex items-center">
                    <div className={`w-8 h-8 ${step >= 2 ? 'bg-primary' : 'bg-gray-300'} text-white rounded-full flex items-center justify-center text-sm font-bold`}>
                      2
                    </div>
                    <span className="ml-2 text-sm text-gray-600">Land Verification</span>
                  </div>
                  <div className={`w-16 h-1 ${step >= 3 ? 'bg-primary' : 'bg-gray-300'}`}></div>
                  <div className="flex items-center">
                    <div className={`w-8 h-8 ${step >= 3 ? 'bg-primary' : 'bg-gray-300'} text-white rounded-full flex items-center justify-center text-sm font-bold`}>
                      3
                    </div>
                    <span className="ml-2 text-sm text-gray-600">Policy Selection</span>
                  </div>
                </div>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {step === 1 && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="fullName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Full Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter your full name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="mobileNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Mobile Number</FormLabel>
                              <FormControl>
                                <div className="flex space-x-2">
                                  <Input placeholder="+91 XXXXX XXXXX" {...field} />
                                  <Button
                                    type="button"
                                    onClick={handleSendOtp}
                                    disabled={sendOtpMutation.isPending}
                                    variant="outline"
                                  >
                                    {sendOtpMutation.isPending ? "Sending..." : "Send OTP"}
                                  </Button>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {showOtpInput && (
                        <div className="flex space-x-2">
                          <Input
                            placeholder="Enter OTP"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            maxLength={6}
                          />
                          <Button
                            type="button"
                            onClick={handleVerifyOtp}
                            disabled={verifyOtpMutation.isPending}
                          >
                            {verifyOtpMutation.isPending ? "Verifying..." : "Verify"}
                          </Button>
                        </div>
                      )}
                    </>
                  )}

                  {step === 2 && (
                    <>
                      <FormField
                        control={form.control}
                        name="aadhaarNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Aadhaar Number</FormLabel>
                            <FormControl>
                              <Input placeholder="XXXX XXXX XXXX" {...field} />
                            </FormControl>
                            <p className="text-sm text-gray-500">This will be used to verify your identity securely</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="state"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>State</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select State" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="maharashtra">Maharashtra</SelectItem>
                                  <SelectItem value="karnataka">Karnataka</SelectItem>
                                  <SelectItem value="andhra-pradesh">Andhra Pradesh</SelectItem>
                                  <SelectItem value="telangana">Telangana</SelectItem>
                                  <SelectItem value="tamil-nadu">Tamil Nadu</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="district"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>District</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select District" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="pune">Pune</SelectItem>
                                  <SelectItem value="nashik">Nashik</SelectItem>
                                  <SelectItem value="aurangabad">Aurangabad</SelectItem>
                                  <SelectItem value="satara">Satara</SelectItem>
                                  <SelectItem value="kolhapur">Kolhapur</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="agreedToTerms"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>
                                I agree to the{" "}
                                <a href="#" className="text-primary hover:underline">
                                  Terms and Conditions
                                </a>{" "}
                                and{" "}
                                <a href="#" className="text-primary hover:underline">
                                  Privacy Policy
                                </a>
                              </FormLabel>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={registerMutation.isPending}
                      >
                        {registerMutation.isPending ? "Creating Account..." : "Complete Registration"}
                      </Button>
                    </>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
